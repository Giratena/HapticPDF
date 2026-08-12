# HapticPDF

A browser-based comic/PDF reader that sends haptic feedback to connected devices as you read. Draw regions over panels, assign EDI scripts to each region, and feel your comics come to life.

**Start:** Run `Start HapticPDF.bat` (or `node server.js`), then open [http://localhost:3000](http://localhost:3000).

## Features

- Open PDF files, image folders, or ZIP archives
- Drag & drop file loading
- Draw haptic regions over pages (ellipse or rectangle shapes)
- Assign EDI scripts per region with priority ordering
- Page-level filler scripts for background haptics
- Integrated Funscript editor for timeline-based scripting
- LTR / RTL reading direction support
- Zoom controls: fit page, fit width, or actual size
- Import CSV script definition lists

## Requirements – EDI

HapticPDF sends haptic commands via **EDI (Easy Device Integration)**. You need EDI running locally to use haptic feedback.
- [EDI on GitHub](https://github.com/NoGRo/Edi)

HapticPDF requires **Node.js** to run the local server.
- Download and install it from [nodejs.org](https://nodejs.org) (LTS version recommended)
- No `npm install` is needed — the server uses only Node.js built-in modules

## Support

Normally I do translations for Japanese -> English! If you enjoy the projects I do, consider supporting me on [Patreon](https://patreon.com/Giratena).
