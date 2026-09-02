# Advanced Dataset Exporter for Adobe Illustrator

**Advanced Dataset Exporter** is an ExtendScript (`.jsx`) tool for Adobe Illustrator that automates batch export of datasets (variables). The script features a modal GUI, dynamic variable mapping for file and subfolder naming, multi-format export support, and duplicate filename handling.

---

## 🌟 Key Features

- **Integrated Modal GUI:** Keeps Illustrator document focus during export for stable, uninterrupted processing.
- **Dynamic File & Subfolder Naming:** Detects text variables in the document (e.g., `code`, `name`, `category`) and automatically uses them as file names or subfolder names.
- **Multi-Format Export in One Run:** Exports to multiple formats simultaneously:
  - **PNG** (24-bit with transparency)
  - **JPG / JPEG** (Maximum quality)
  - **SVG**
  - **PDF** (PDF 1.5)
  - **PSD** (Photoshop with layers)
  - **AI / EPS**
- **Flexible Folder Hierarchy:** Supports two folder structures:
  - `Format / Subfolder / FileName.ext`
  - `Subfolder / Format / FileName.ext`
- **Duplicate File Handling:** Option to overwrite existing files or auto-rename duplicates with suffixes (`_1`, `_2`, etc.).
- **Real-time Progress & Cancel:** Visual progress bar showing the current dataset being processed, with a cancel button to stop anytime.
- **Cross-Platform:** Fully compatible with both Windows and macOS.

---

## 🛠️ System Requirements

- **Adobe Illustrator:** CC 2015 or newer (tested on CS6, CC 2020–2026).
- **Operating System:** Windows 10/11 or macOS.
- The Illustrator document must have **Variables** and **Data Sets** (can be created manually or imported using _VariableImporter_).

---

## 🚀 Usage Instructions

1. Download or _clone_ this repository.
2. Open your Adobe Illustrator (`.ai`) document containing variables and datasets.
3. Run the script via the menu:
   ```text
   File > Scripts > Other Script... (Ctrl+F12 / Cmd+F12)
   ```
   Then select `AdvancedDatasetExporter.jsx`.
4. In the panel UI:
   - Choose the output folder destination.
   - Assign variables to use as file names and subfolder names.
   - Check the desired output formats.
   - Configure folder structure and duplicate file handling.
   - Click **Start Export**.

```text
Tip: Save AdvancedDatasetExporter.jsx to Illustrator's default Scripts folder for direct access from the File > Scripts menu:

- Windows: C:\Program Files\Adobe\Adobe Illustrator [Version]\Presets\[Language]\Scripts
- macOS: /Applications/Adobe Illustrator [Version]/Presets/[Language]/Scripts
```

📁 Export Directory Structure

**Option 1: Format first, then Subfolder**

```
OutputFolder/
├── PNG/
│   ├── FM-Series/
│   │   ├── FM-2008.png
│   │   └── FM-2009.png
├── PDF/
│   ├── FM-Series/
│   │   ├── FM-2008.pdf
│   │   └── FM-2009.pdf
```

**Option 2: Subfolder first, then Format**

```
OutputFolder/
├── FM-Series/
│   ├── PNG/
│   │   ├── FM-2008.png
│   │   └── FM-2009.png
│   ├── PDF/
│   │   ├── FM-2008.pdf
│   │   └── FM-2009.pdf
```

---

## 📄 License

This project is licensed under the [MIT License](./LICENSE).
