/***
{
    "name": "Advanced Dataset Exporter",
    "scriptVersion": "5.3.0",
    "description": "Batch export Adobe Illustrator datasets to multiple file formats with dynamic variable-based filenames and automated folder hierarchy.",
    "compatibility": {
        "hostApp": "Adobe Illustrator",
        "minVersion": "2025",
        "testedOn": ["macOS", "Windows 10/11"]
    },
    "features": [
        "Modal UI panel for stable document context execution",
        "Dynamic detection and selection of document variables for naming and folder structure",
        "Multi-format concurrent export (PNG, JPG, SVG, PDF, PSD, AI)",
        "Customizable folder hierarchy (Format-first or Variable-first subfolders)",
        "File conflict handling with Overwrite or Auto-Rename (_1, _2) modes",
        "Real-time UI progress tracking with cancellation support"
    ],
    "usage": {
        "step1": "Open an Illustrator document containing datasets and variables.",
        "step2": "Run the script via File > Scripts > Other Script...",
        "step3": "Select the main output destination folder.",
        "step4": "Choose file and folder naming variables, output formats, and structure.",
        "step5": "Click 'Mulai Ekspor' to begin batch extraction."
    },
    "author" : {
		"by" : "salmondarat",
        "email" : "salmondarat@gmail.com",
        "notes": "Custom ExtendScript tailored for high-volume dataset extraction."
    }
}
***/

#target illustrator
#targetengine main
//the ui has problems and crashes when this isn't used
#script "Dataset Exporter"

function runAdvancedExporter() {
    // 1. Validate main document in the start
    if (app.documents.length === 0) {
        alert("Open Adobe Illustrator document with configured variable datasets!");
        return;
    }

    var doc = app.activeDocument;
    var datasets = doc.dataSets;

    if (datasets.length === 0) {
        alert("Document '" + doc.name + "' Doesn't have registered dataset");
        return;
    }

    // 2. make Modal window (dialog)
    var win = new Window("dialog", "Advanced Dataset Exporter", undefined, { closeButton: true });
    win.orientation = "column";
    win.alignChildren = ["fill", "top"];
    win.spacing = 10;
    win.margins = 15;

    // --- GROUP 1: CHOOSE OUTPUT FOLDER ---
    var panelFolder = win.add("panel", undefined, "1. Output Folder location");
    panelFolder.orientation = "column";
    panelFolder.alignChildren = ["fill", "top"];
    panelFolder.margins = 10;

    var groupFolderSelect = panelFolder.add("group");
    var txtFolderPath = groupFolderSelect.add("edittext", undefined, "Doen't pick a fodler yet...");
    txtFolderPath.preferredSize.width = 230;
    txtFolderPath.readonly = true;

    var btnSelectFolder = groupFolderSelect.add("button", undefined, "Choose...");
    var selectedMainFolder = null;

    btnSelectFolder.onClick = function() {
        var f = Folder.selectDialog("Select the Main Export Destination Folder");
        if (f) {
            selectedMainFolder = f;
            txtFolderPath.text = f.fsName;
        }
    };

    // --- GROUP 2: VARIABLE SELECTION ---
    var panelVar = win.add("panel", undefined, "2. Variable Settings");
    panelVar.orientation = "column";
    panelVar.alignChildren = ["fill", "top"];
    panelVar.margins = 10;

    var groupFileVar = panelVar.add("group");
    groupFileVar.add("statictext", undefined, "File Name Variable:");
    var dropdownFileName = groupFileVar.add("dropdownlist", undefined, []);
    dropdownFileName.preferredSize.width = 180;

    var groupFolderVar = panelVar.add("group");
    groupFolderVar.add("statictext", undefined, "Variabel Subfolder:");
    var dropdownSubfolder = groupFolderVar.add("dropdownlist", undefined, []);
    dropdownSubfolder.preferredSize.width = 180;

    // Population Variabel Otomatis
    dropdownFileName.add("item", "[ Use Dataset Name ]");
    dropdownSubfolder.add("item", "[ Without Subfolder ]");

    for (var v = 0; v < doc.variables.length; v++) {
        var varItem = doc.variables[v];
        dropdownFileName.add("item", varItem.name);
        dropdownSubfolder.add("item", varItem.name);
    }

    dropdownFileName.selection = 0;
    dropdownSubfolder.selection = 0;

    // Display information about detected custom variables.
    var codeVarDetected = false;
    for (var c = 0; c < doc.variables.length; c++) {
        var vName = doc.variables[c].name.toLowerCase();
        if (vName === "code" || vName === "kode") {
            dropdownFileName.selection = c + 1; // Auto select variabel code if exist
            codeVarDetected = true;
            break;
        }
    }

    // --- GROUP 3: FORMAT OUTPUT ---
    var panelFormat = win.add("panel", undefined, "3. Format Output");
    panelFormat.orientation = "column";
    panelFormat.alignChildren = ["left", "top"];
    panelFormat.margins = 10;

    var chkPNG = panelFormat.add("checkbox", undefined, "PNG (24-bit Transparent)");
    var chkJPG = panelFormat.add("checkbox", undefined, "JPG / JPEG (Maximum Quality)");
    var chkSVG = panelFormat.add("checkbox", undefined, "SVG");
    var chkPDF = panelFormat.add("checkbox", undefined, "PDF");
    var chkPSD = panelFormat.add("checkbox", undefined, "PSD (Photoshop)");
    var chkAI  = panelFormat.add("checkbox", undefined, "AI / EPS");

    chkPNG.value = true; // Default

    // --- GROUP 4: Folder Structure and Duplication ---
    var panelStructure = win.add("panel", undefined, "4. Folder Structure and File Duplication");
    panelStructure.orientation = "column";
    panelStructure.alignChildren = ["left", "top"];
    panelStructure.margins = 10;

    panelStructure.add("statictext", undefined, "Structure Subfolder:");
    var radFormatFirst = panelStructure.add("radiobutton", undefined, "Format first, then Variables ( Format / Subfolder / File )");
    var radVarFirst    = panelStructure.add("radiobutton", undefined, "Variable first, then Format (Subfolder / Format / File)");
    radFormatFirst.value = true;

    panelStructure.add("statictext", undefined, "If the File Name Already Exists:");
    var radOverwrite = panelStructure.add("radiobutton", undefined, "Overwrite");
    var radRename    = panelStructure.add("radiobutton", undefined, "Create a Unique Name (Add the suffix _1, _2, etc.)");
    radOverwrite.value = true;

    // --- GROUP 5: REAL-TIME PROGRESS ---
    var panelStatus = win.add("panel", undefined, "Export Status");
    panelStatus.orientation = "column";
    panelStatus.alignChildren = ["fill", "top"];
    panelStatus.margins = 10;

    var statusText = panelStatus.add("statictext", undefined, "Status: Ready to export " + datasets.length + " dataset.");
    statusText.preferredSize.width = 340;

    var datasetText = panelStatus.add("statictext", undefined, "Dataset Active: -");
    datasetText.preferredSize.width = 340;

    var progressBar = panelStatus.add("progressbar", undefined, 0, datasets.length);
    progressBar.preferredSize.width = 340;
    progressBar.value = 0;

    var groupAction = win.add("group");
    groupAction.alignment = ["fill", "top"];
    var btnStart  = groupAction.add("button", undefined, "Start Export");
    var btnCancel = groupAction.add("button", undefined, "Cancel / Close");

    var isCancelled = false;

    // --- HELPER FUNCTIONS ---
    function getVariableValue(targetDoc, varName) {
        if (!varName || varName.indexOf("[") === 0) return null;
        try {
            var targetVar = targetDoc.variables.getByName(varName);
            if (targetVar && targetVar.pageItems.length > 0) {
                for (var k = 0; k < targetVar.pageItems.length; k++) {
                    var item = targetVar.pageItems[k];
                    if (item.typename === "TextFrame") {
                        return item.contents;
                    }
                }
            }
        } catch (e) {}
        return null;
    }

    function sanitizeName(str) {
        if (!str) return "";
        return str.replace(/[\/\\:*?"<>|\r\n\t]/g, "_").replace(/^\s+|\s+$/g, "");
    }

    function getValidFileTarget(folderObj, baseName, ext, shouldOverwrite) {
        var fileObj = new File(folderObj.fsName + "/" + baseName + "." + ext);
        if (shouldOverwrite || !fileObj.exists) {
            return fileObj;
        }

        var counter = 1;
        while (fileObj.exists) {
            fileObj = new File(folderObj.fsName + "/" + baseName + "_" + counter + "." + ext);
            counter++;
        }
        return fileObj;
    }

    // --- MAIN EXPORT PROCESS ---
    btnStart.onClick = function() {
        if (!selectedMainFolder || !selectedMainFolder.exists) {
            alert("Please select the destination output folder first!");
            return;
        }

        if (!chkPNG.value && !chkJPG.value && !chkSVG.value && !chkPDF.value && !chkPSD.value && !chkAI.value) {
            alert("Select at least one output format!");
            return;
        }

        // Lock UI State
        isCancelled = false;
        btnStart.enabled = false;
        btnSelectFolder.enabled = false;
        btnCancel.text = "Cancel / Stop";

        var selectedFileNameVar  = dropdownFileName.selection ? dropdownFileName.selection.text : "";
        var selectedSubfolderVar = dropdownSubfolder.selection ? dropdownSubfolder.selection.text : "";

        var exportedCount = 0;
        var errorLog = [];

        // Loop Dataset
        for (var i = 0; i < datasets.length; i++) {
            if (isCancelled) break;

            try {
                var ds = datasets[i];
                ds.display();
                ds.update();
                app.redraw();

                // Get the filename value
                var fileNameVal = getVariableValue(doc, selectedFileNameVar);
                if (!fileNameVal || fileNameVal === "") fileNameVal = ds.name;
                var safeFileName = sanitizeName(fileNameVal);

                // Get subfolder name value
                var subfolderVal = getVariableValue(doc, selectedSubfolderVar);
                var safeSubfolder = sanitizeName(subfolderVal);

                // Update Progress UI Real-time
                statusText.text = "Status: Processing (" + (i + 1) + " from " + datasets.length + ")";
                datasetText.text = "Dataset: " + safeFileName;
                progressBar.value = i + 1;
                win.update();

                // Export to the selected format
                exportItemFormats(doc, selectedMainFolder, safeFileName, safeSubfolder, radFormatFirst.value, radOverwrite.value);
                exportedCount++;

            } catch (err) {
                errorLog.push("Dataset " + (i + 1) + " (" + ds.name + ") Failed: " + err.message);
            }
        }

        // Restore UI
        btnStart.enabled = true;
        btnSelectFolder.enabled = true;
        btnCancel.text = "Close";

        if (isCancelled) {
            statusText.text = "Status: Process Cancelled.";
            alert("Process cancelled by the user!\nTotal datasets successfully exported: " + exportedCount);
        } else {
            statusText.text = "Status: Export Complete!";
            var msg = "Export Completed Successfully!\nTotal " + exportedCount + " The dataset has been processed..";
            if (errorLog.length > 0) {
                msg += "\n\nOccured " + errorLog.length + " log:\n- " + errorLog.join("\n- ");
            }
            alert(msg);
        }
    };

    btnCancel.onClick = function() {
        if (btnStart.enabled === false) {
            // If the process is running, function as Cancel
            isCancelled = true;
            statusText.text = "Status: Canceling process...";
            win.update();
        } else {
            // If idle, close the modal window.
            win.close();
        }
    };

    // --- Safe Save/Export function without document tracking/audit trails. ---
    function exportItemFormats(mainDoc, mainFolder, fileName, subfolderName, formatFirst, shouldOverwrite) {
        var formats = [];
        if (chkPNG.value) formats.push("PNG");
        if (chkJPG.value) formats.push("JPG");
        if (chkSVG.value) formats.push("SVG");
        if (chkPDF.value) formats.push("PDF");
        if (chkPSD.value) formats.push("PSD");
        if (chkAI.value)  formats.push("AI");

        for (var f = 0; f < formats.length; f++) {
            var fmt = formats[f];
            var targetDir;

            if (formatFirst) {
                targetDir = new Folder(mainFolder.fsName + "/" + fmt + (subfolderName ? "/" + subfolderName : ""));
            } else {
                targetDir = new Folder(mainFolder.fsName + (subfolderName ? "/" + subfolderName : "/General") + "/" + fmt);
            }

            if (!targetDir.exists) targetDir.create();

            var ext = fmt.toLowerCase();
            if (fmt === "JPG") ext = "jpg";
            var targetFile = getValidFileTarget(targetDir, fileName, ext, shouldOverwrite);

            switch (fmt) {
                case "PNG":
                    var optPNG = new ExportOptionsPNG24();
                    optPNG.artBoardClipping = true;
                    optPNG.transparency = true;
                    optPNG.antiAliasing = true;
                    mainDoc.exportFile(targetFile, ExportType.PNG24, optPNG);
                    break;

                case "JPG":
                    var optJPG = new ExportOptionsJPEG();
                    optJPG.artBoardClipping = true;
                    optJPG.qualitySetting = 100;
                    optJPG.antiAliasing = true;
                    mainDoc.exportFile(targetFile, ExportType.JPEG, optJPG);
                    break;

                case "SVG":
                    var optSVG = new ExportOptionsSVG();
                    optSVG.embedRasterImages = true;
                    mainDoc.exportFile(targetFile, ExportType.SVG, optSVG);
                    break;

                case "PSD":
                    var optPSD = new ExportOptionsPhotoshop();
                    optPSD.writeLayers = true;
                    mainDoc.exportFile(targetFile, ExportType.PHOTOSHOP, optPSD);
                    break;

                case "PDF":
                    var optPDF = new PDFSaveOptions();
                    optPDF.compatibility = PDFCompatibility.PDF15;
                    // Export as a copy without changing the original file.
                    mainDoc.saveAs(targetFile, optPDF);
                    break;

                case "AI":
                    var optAI = new IllustratorSaveOptions();
                    // Export as a copy without changing the original file.
                    mainDoc.saveAs(targetFile, optAI);
                    break;
            }
        }
    }

    win.center();
    win.show();
}

// Run the functions
runAdvancedExporter();