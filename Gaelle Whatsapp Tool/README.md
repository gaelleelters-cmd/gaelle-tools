# WhatsApp Tool

A standalone HTML app for WhatsApp messaging — open `index.html` in your browser. No install, no login, no server.

## Features

- **Single Sender** — Send a message to one contact with formatting toolbar, emoji picker, and RTL/LTR support
- **WhatsApp Formula** — Generate `HYPERLINK` formulas for Excel 365 and Google Sheets
- **Bulk Sender** — Upload CSV/Excel, send same or custom messages, export links

## Quick Start

1. Double-click `index.html`, or open it in Chrome / Edge / Firefox
2. Use the tabs: Single Sender, WhatsApp Formula, Bulk Sender

Bulk Excel/CSV reading uses SheetJS from a CDN, so you need internet the first time you open the page (or keep the CDN cached).

## Usage

### Single Sender
Enter phone number (with country code), compose your message, click **Send on WhatsApp**.

### WhatsApp Formula
Build a message template with `{Param 1}`, `{Param 2}`, etc. Map each param to a column letter, set phone column and row number, then generate formulas.

### Bulk Sender
Drop an Excel or CSV file, choose phone column, pick same message or per-row custom message, then generate and open/export links.
