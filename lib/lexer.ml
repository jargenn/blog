module Layout = struct
  type blanks = string
  type nonrec string = string
  type nonrec char = char
  type count = int
  type indent = int

  let string s = s
  let empty = string ""
end

module Block = struct
  type t = ..

  module Blank_line = struct
    type t = string
  end

  module Block_quote = struct
    type t = { indent : int; block : t }
  end

  module Code_block = struct
    type fenced_layout = {
      indent : int;
      opening_fence : string;
      closing_fence : string option;
    }

    let default_fenced_layout =
      {
        indent = 0;
        opening_fence = Layout.empty;
        closing_fence = Some Layout.empty;
      }

    type layout = [ `Indented | `Fenced of fenced_layout ]

    type t = {
      layout : layout;
      info_string : string option;
      code : string list;
    }

    let make ?(layout = `Fenced default_fenced_layout) ?info_string code =
      let layout =
        match (info_string, layout) with
        | Some _, `Indented -> `Fenced default_fenced_layout
        | _, layout -> layout
      in
      { layout; info_string; code }

    let layout cb = cb.layout
    let info_string cb = cb.info_string
    let code cb = cb.code
  end

  type t +=
    | Blank_line of Blank_line.t
    | Block_quote of Block_quote.t
    | Blocks of t list
    | Code_block of Code_block.t
    | Heading
    | Html_block
    | List
    | Paragraph
    | Thematic_break
    | Side_note
end
