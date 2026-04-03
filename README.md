# DOCU

DOCU is a Next.js-based multi-format document workspace. It lets us upload Word, PDF, image, text, HWPX, and existing `.skkf` workspace files together, reorder them, edit them in one session, and export the whole sequence as a single PDF.

## What It Does

- Upload multiple files in one batch from the home screen.
- Reorder documents before entering the editor.
- Keep that same order inside the editor session and in merged PDF export.
- Edit rich-text documents with TipTap.
- Edit PDF/image-style layout documents with positioned text and object layers.
- Save individual workspace documents as `.skkf`.
- Export the entire session as one merged PDF.

## User Flow

### 1. Home

- Add multiple files through drag-and-drop or file picker.
- Review the queue and change document order.
- Start editing after parsing succeeds.
- Resume the last browser session from `sessionStorage`.

### 2. Editor

- Navigate documents from the sidebar.
- Switch between rich editor mode and layout editor mode depending on document type.
- Save the current document back into `.skkf`.
- Export every document in the active session as one PDF.

## Main Structure

```text
src/
  app/
    api/
      export/route.ts      # Renders each document to PDF and merges all PDFs
      parse/route.ts       # Parses uploaded files into SKKF + HTML
      save/route.ts        # Saves edited HTML back into SKKF
    editor/page.tsx        # Multi-document editor workspace
    globals.css            # DOCU visual system and editor styling
    layout.tsx             # App metadata and global shell
    page.tsx               # Home screen with multi-file queue and sequencing
  components/
    LayoutEditor.tsx       # Positioned editor for PDF/image-style documents
    Toolbar.tsx            # Rich text toolbar for TipTap documents
    UploadZone.tsx         # Multi-file upload and drag-drop area
  lib/
    editor-fonts.ts        # Shared font options for editors
    editor-session.ts      # Session model for multiple documents
    exporters/
      pdf.ts               # HTML to PDF export and PDF merge helpers
    extensions/
      font-size.ts         # TipTap font-size extension
    parsers/
      docx.ts              # Word parsing
      image.ts             # OCR and layout generation for images
      pdf.ts               # PDF parsing, text extraction, object extraction
      text.ts              # TXT and Markdown parsing
    skkf/
      reader.ts            # Reads SKKF
      schema.ts            # Shared API and manifest types
      writer.ts            # Writes SKKF
```

## Session Model

The browser keeps the active workspace in `sessionStorage` under:

- `skkfEditorSession`

Each session document stores:

- `skkfBase64`
- `html`
- `manifest`
- `warnings`

Legacy single-document keys are still migrated automatically when entering the editor.

## API

### `POST /api/parse`

Input:

- `multipart/form-data`
- `file`

Output:

- `success`
- `skkfBase64`
- `manifest`
- `html`
- `warnings`

### `POST /api/save`

Input:

- `skkfBase64`
- `html`
- `title`

Output:

- `success`
- `skkfBase64`

### `POST /api/export`

Input:

- `title`
- `documents[]`

Each document can include:

- `skkfBase64`
- `html`
- `title`

Output:

- `success`
- `pdfBase64`

## Development

```bash
npm install
npm run dev
```

Verification:

```bash
npx tsc --noEmit
npm run build
```

## Current Notes

- The product branding is now `DOCU`, but the internal workspace file format remains `.skkf` for compatibility.
- PDF/font fidelity still depends on available fonts and what can be inferred or embedded from the original source.
- Layout editing for PDF/image documents is object-based, but scanned tables and drawings are not yet fully reconstructed into semantic office objects.
