open Core
open Core_unix

let elapsed_ms start =
  Time_float.Span.to_ms (Time_float.diff (Time_float.now ()) start)
[@@inline]

let copy_file src dst =
  print_endline (Printf.sprintf "- '%s'" dst);
  In_channel.with_file src ~f:(fun file ->
      let data = In_channel.input_all file in
      match Filename.split_extension src with
      | _, Some "css" ->
          let open Cascade in
          let data =
            data |> Css.of_string_exn |> Css.optimize
            |> Css.to_string ~minify:true
          in

          Out_channel.write_all dst ~data
      | _ -> Out_channel.write_all dst ~data)

let rec mkdir_p dir =
  if not (Stdlib.Sys.file_exists dir) then begin
    let parent = Filename.dirname dir in
    if not (String.equal parent dir) then mkdir_p parent;
    mkdir dir ~perm:0o755
  end

let rec walk_dir dir =
  Stdlib.Sys.readdir dir |> Array.to_list
  |> List.filter ~f:(fun entry ->
      not (String.equal entry "." || String.equal entry ".."))
  |> List.concat_map ~f:(fun entry ->
      let path = Filename.concat dir entry in
      match (Core_unix.lstat path).st_kind with
      | S_DIR -> walk_dir path
      | S_REG -> [ path ]
      | _ -> [])

module Asset = struct
  module M = String.Map

  type t = { manifest : string M.t }

  let hash_file path = Md5.digest_file_blocking path |> Md5.to_hex

  let should_fingerprint logical =
    match Filename.split_extension logical with
    | _, Some ("css" | "js") -> true
    | _ -> false

  let output_name logical hash =
    let base = Filename.basename logical in
    let dir = Filename.dirname logical in
    let stem, ext = Filename.split_extension base in

    match ext with
    | None -> logical
    | Some ext -> Filename.concat dir (stem ^ "-" ^ hash ^ "." ^ ext)

  let build ~roots =
    print_endline "Building asset manifest!";

    let manifest =
      List.fold roots ~init:M.empty ~f:(fun manifest root ->
          let root_name = Filename.basename root in

          walk_dir root
          |> List.fold ~init:manifest ~f:(fun manifest src ->
              let relative = String.chop_prefix_exn src ~prefix:(root ^ "/") in

              let logical = Filename.concat root_name relative in

              let output =
                if should_fingerprint logical then
                  output_name logical (hash_file src)
                else logical
              in

              let dst = Filename.concat "dist" output in

              mkdir_p (Filename.dirname dst);
              copy_file src dst;

              Map.set manifest ~key:logical ~data:("/" ^ output)))
    in
    { manifest }
end

type stage = Private | Draft | Finished [@@deriving sexp]

module Frontmatter = struct
  type t = {
    title : string;
    stage : stage;
    abstract : string;
    tags : string list;
  }
  [@@deriving sexp]

  (* Tries to parse the raw_text returning both the Frontmatter.t parsed from a s-expression and the rest of the raw text body *)
  let parse_exn raw_text =
    let lines = String.split_lines raw_text in

    match lines with
    | first :: rest when String.equal first "---" ->
        let rec find_end acc = function
          | [] -> failwith "Unclosed frontmatter"
          | line :: lines when String.equal line "---" -> (List.rev acc, lines)
          | line :: lines -> find_end (line :: acc) lines
        in

        let fm_text, body_text =
          let fm_lines, body_lines = find_end [] rest in
          (String.concat ~sep:"\n" fm_lines, String.concat ~sep:"\n" body_lines)
        in

        let frontmatter = t_of_sexp (Sexp.of_string fm_text) in

        (frontmatter, body_text)
    | _ -> failwith "Missing frontmatter"
end

module Toc = struct
  type t = {
    level : int;
    text : string;
    slug : string;
    mutable children : t list;
  }
  (* [@@deriving sexp] *)

  let add_child parent child = parent.children <- parent.children @ [ child ]

  let heading_text heading =
    let str =
      Cmarkit.Inline.to_plain_text ~break_on_soft:true
        (Cmarkit.Block.Heading.inline heading)
    in
    String.concat ~sep:" " (List.map ~f:(String.concat ~sep:"") str)

  let build doc =
    let root = ref [] in
    let stack = ref [] in

    let add_heading ~level ~text ~slug =
      let entry = { level; text; slug; children = [] } in
      while
        match !stack with parent :: _ -> parent.level >= level | [] -> false
      do
        stack := List.tl_exn !stack
      done;

      (match !stack with
      | [] -> root := !root @ [ entry ]
      | parent :: _ -> add_child parent entry);

      stack := entry :: !stack
    in

    let rec visit block =
      match block with
      | Cmarkit.Block.Heading (heading, _) ->
          let level = Cmarkit.Block.Heading.level heading in
          if level > 1 then begin
            let text = heading_text heading in
            let slug = text in

            add_heading ~level ~text ~slug
          end
      | Cmarkit.Block.Blocks (blocks, _) -> List.iter ~f:visit blocks
      | Cmarkit.Block.Block_quote (bq, _) ->
          visit (Cmarkit.Block.Block_quote.block bq)
      | Cmarkit.Block.List (l, _) ->
          Cmarkit.Block.List'.items l
          |> List.iter ~f:(fun (item, _) ->
              visit (Cmarkit.Block.List_item.block item))
      | _ -> ()
    in

    visit (Cmarkit.Doc.block doc);

    !root

  let to_html ast =
    let toc = build ast in
    let open Tyxml in
    if List.is_empty toc then ""
    else begin
      let rec render_entries entries =
        Html.ul (List.map entries ~f:render_entry)
      and render_entry entry =
        let link =
          Html.a
            ~a:[ Html.a_class [ "toc-entry" ]; Html.a_href ("#" ^ entry.slug) ]
            [ Html.txt entry.text ]
        in
        let children =
          if List.is_empty entry.children then []
          else [ render_entries entry.children ]
        in
        Html.li (link :: children)
      in

      let contents_link =
        Html.a
          ~a:[ Html.a_href "#home-page-top"; Html.a_class [ "toc-entry" ] ]
          [
            Html.h2 ~a:[ Html.a_class [ "toc-header" ] ] [ Html.txt "Contents" ];
          ]
      in

      let root =
        Html.div
          [
            contents_link;
            Html.menu ~children:(`Flows [ render_entries toc ]) ();
          ]
      in

      Format.asprintf "%a" (Html.pp_elt ()) root
    end
end

module Post = struct
  type t = { fm : Frontmatter.t; ast : Cmarkit.Doc.t; path : string }

  let create ~fm ~ast ~path = { fm; ast; path }
  let process post = print_endline (Toc.to_html post.ast)
end

type ctx = {
  mutable read : float;
  mutable parse : float;
  mutable render : float;
  mutable collect : float;
  mutable total : float;
}

let serve ~browser = ()

let collect_posts ctx =
  let start = Time_float.now () in
  let posts =
    walk_dir "contents/posts"
    |> List.filter ~f:(fun entry ->
        match Filename.split_extension entry with
        | _, Some ext -> String.equal ext "dj"
        | _ -> false)
    |> List.map ~f:(fun path ->
        In_channel.with_file path ~f:(fun file ->
            let start = Time_float.now () in

            let raw_text = In_channel.input_all file in

            ctx.read <- ctx.read +. elapsed_ms start;

            let start = Time_float.now () in

            let fm, rest = Frontmatter.parse_exn raw_text in
            let ast = Cmarkit.Doc.of_string rest in

            ctx.parse <- ctx.parse +. elapsed_ms start;

            Post.create ~fm ~ast ~path))
  in

  ctx.collect <- elapsed_ms start;
  posts

let process_posts posts = posts |> List.iter ~f:(fun p -> Post.process p)

let build ~blogroll =
  let ctx = { read = 0.; parse = 0.; render = 0.; collect = 0.; total = 0. } in
  let start = Time_float.now () in

  mkdir_p "dist";
  let _ = Asset.build ~roots:[ "contents/assets"; "contents/css" ] in

  collect_posts ctx |> process_posts;

  ctx.total <- elapsed_ms start
