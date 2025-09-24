import {
    Links,
    Meta,
    Outlet,
    Scripts,
  } from "@remix-run/react";
    import "./tailwind.css";
    import   "./style.css";
  export default function App() {
    return (
      <html>
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <link
            rel="icon"
            href="data:image/x-icon;base64,AA"
          />
          <link href="/src/style.css" rel="stylesheet" />
          <Meta />
          <Links />
        </head>
        <body>
          <Outlet />
  
          <Scripts />
        </body>
      </html>
    );
  }
  