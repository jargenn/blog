let rec mkdir_p path =
  if not (Sys.file_exists path)
  then (
    mkdir_p (Filename.dirname path);
    Unix.mkdir path 0o755)
;;

let to_lower_snake_case input =
  input
  |> Str.global_replace (Str.regexp "\\([a-z0-9]\\)\\([A-Z]\\)") "\\1_\\2"
  |> Str.global_replace (Str.regexp "[^a-zA-Z0-9]+") "_"
  |> Str.global_replace (Str.regexp "_+") "_"
  |> Str.global_replace (Str.regexp "^_\\|_$") ""
  |> String.lowercase_ascii
;;

module Blog = struct
  type frontmatter =
    { title : string
    ; published : bool
    ; tags : string list
    ; abstract : string
    }
  [@@deriving yojson]

  let draft title =
    let date =
      let now = Unix.time () in
      let localtime = Unix.localtime now in
      Printf.sprintf
        "%04d-%02d-%02d"
        (localtime.tm_year + 1900)
        (localtime.tm_mon + 1)
        localtime.tm_mday
    in
    let slug = to_lower_snake_case title in
    let path = Printf.sprintf "./contents/posts/%s-%s.md" date slug in
    print_endline (Printf.sprintf "drafted post %s" path);
    let dir = Filename.dirname path in
    mkdir_p dir;
    let oc = open_out path in
    let frontmatter =
      frontmatter_to_yojson { title; published = false; tags = []; abstract = "abstract" }
      |> Yojson.Safe.pretty_to_string
    in
    Fun.protect
      ~finally:(fun () -> close_out oc)
      (fun () -> Printf.fprintf oc "---\n%s\n---\n" frontmatter)
  ;;
end

let print_help () = print_endline "usage: blog <file>"

let () =
  (* let input = In_channel.with_open_bin "about.dj" In_channel.input_all in *)
  (* let doc = Cmarkit.Doc.of_string input in *)
  (* let output = Cmarkit_html.of_doc ~safe:true doc in *)
  (* print_endline output *)
  let args = Sys.argv in
  if Array.length args < 2
  then (
    print_help ();
    exit 2);
  match args.(1) with
  | "draft" -> Blog.draft args.(2)
  | "build" ->
    let title_name = args.(2) in
    Printf.printf "Drafting !!! %s" title_name
  | "watch" ->
    let title_name = args.(2) in
    Printf.printf "Drafting !!! %s" title_name
  | "serve" ->
    let title_name = args.(2) in
    Printf.printf "Drafting !!! %s" title_name
  | "help" -> print_help ()
  | _ -> prerr_endline "No me importa"
;;
