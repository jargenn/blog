open Core
open Rook
open Core_unix

let build =
  Command.basic ~summary:"Execute the build pipeline for the static assets"
    (let%map_open.Command blogroll =
       flag "--blogroll" no_arg ~doc:"builds the blogroll"
     in
     fun () -> Blog.build ~blogroll)

let serve =
  Command.basic ~summary:"Starts the development server for the blog"
    (let%map_open.Command browser =
       flag "--open" no_arg ~doc:"opens the website on the default browser"
     in
     fun () -> Blog.serve ~browser)

let command =
  Command.group ~summary:"Static Blog Generator"
    [ ("serve", serve); ("build", build) ]

let () = Command_unix.run ~version:"0.0.1" ~build_info:"RWO" command
