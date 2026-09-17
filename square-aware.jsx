/*
    Square + Fill + WebP Batch Tool
    --------------------------------
    For each image in a folder:
      1. Makes the canvas square (pads the shorter side).
      2. If the image has real transparency (e.g. a cut-out PNG), the new
         area (and any other transparent pixels) is filled with solid white.
      3. If the image is flat/opaque (e.g. a JPEG photo), the padding is
         selected, expanded inward by N px, and filled using Content-Aware
         Fill (the classic, scriptable engine — see note below).
      4. Optionally resizes the final square to a fixed pixel size.
      5. Exports as native WebP.

    IMPORTANT NOTE ON CONTENT-AWARE FILL
    -------------------------------------
    Photoshop has two different "Content-Aware Fill" features:
      a) The classic one behind Edit > Fill... > Contents: Content-Aware.
         This is a simple, headless, scriptable operation.
      b) The interactive "Content-Aware Fill" WORKSPACE (Edit > Content-Aware
         Fill...), which opens a live preview panel for manually choosing the
         sampling area, rotation, scaling, mirroring, etc. This is a UI-driven
         tool, not something meant to be fired blind via executeAction with an
         empty descriptor — doing so does not reliably reproduce what you'd
         get by using it manually, which is why results looked wrong before.
    This script only ever uses (a).

    REQUIREMENTS
    ------------
    - Photoshop 23.2 (2022) or later, for native WebP export support.
*/

#target photoshop

app.bringToFront();

function s2t(s) { return app.stringIDToTypeID(s); }

// ---------------------------------------------------------------------------
// Helper: Ensure subfolder paths exist on disk
// ---------------------------------------------------------------------------
function ensureFolderExists(folder) {
    if (!folder.exists) {
        if (folder.parent && !folder.parent.exists) {
            ensureFolderExists(folder.parent);
        }
        folder.create();
    }
}

// ---------------------------------------------------------------------------
// Helper: Recursively find all supported image files
// ---------------------------------------------------------------------------
function getFilesRecursive(folder, includeSubfolders) {
    var files = [];
    var items = folder.getFiles();
    var pattern = /\.(jpg|jpeg|png|tif|tiff|bmp|psd|webp)$/i;

    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (item instanceof Folder && includeSubfolders) {
            files = files.concat(getFilesRecursive(item, true));
        } else if (item instanceof File && pattern.test(item.name)) {
            files.push(item);
        }
    }
    return files;
}

// ---------------------------------------------------------------------------
// Content-Aware Fill (classic / headless engine)
// ---------------------------------------------------------------------------
function contentAwareFillSelection() {
    var desc = new ActionDescriptor();
    desc.putEnumerated(s2t("using"), s2t("fillContents"), s2t("contentAware"));
    desc.putEnumerated(s2t("mode"), s2t("blendMode"), s2t("normal"));
    desc.putUnitDouble(s2t("opacity"), s2t("percentUnit"), 100);
    executeAction(s2t("fill"), desc, DialogModes.NO);
}

// ---------------------------------------------------------------------------
// Select the two padding rectangles created by squaring the canvas
// ---------------------------------------------------------------------------
function selectPadding(doc, w, h, maxDim) {
    if (w > h) {
        // wide image -> padding is top & bottom
        var padH = (maxDim - h) / 2;
        doc.selection.select(
            [[0, 0], [maxDim, 0], [maxDim, padH], [0, padH]],
            SelectionType.REPLACE
        );
        doc.selection.select(
            [[0, maxDim - padH], [maxDim, maxDim - padH], [maxDim, maxDim], [0, maxDim]],
            SelectionType.EXTEND
        );
    } else {
        // tall image -> padding is left & right
        var padW = (maxDim - w) / 2;
        doc.selection.select(
            [[0, 0], [padW, 0], [padW, maxDim], [0, maxDim]],
            SelectionType.REPLACE
        );
        doc.selection.select(
            [[maxDim - padW, 0], [maxDim, 0], [maxDim, maxDim], [maxDim - padW, maxDim]],
            SelectionType.EXTEND
        );
    }
}

// ---------------------------------------------------------------------------
// Fill any transparent pixels with solid white (padding + any interior alpha)
// ---------------------------------------------------------------------------
function fillTransparencyWithWhite(doc) {
    var whiteLayer = doc.artLayers.add();
    whiteLayer.move(doc, ElementPlacement.PLACEATEND); // send to bottom of stack
    doc.activeLayer = whiteLayer;

    var white = new SolidColor();
    white.rgb.red = 255;
    white.rgb.green = 255;
    white.rgb.blue = 255;

    doc.selection.selectAll();
    doc.selection.fill(white, ColorBlendMode.NORMAL, 100, false);
    doc.selection.deselect();

    doc.flatten();
}

// ---------------------------------------------------------------------------
// Does this document have real transparency? (merges visible layers first,
// since flatten() would destroy the alpha we need to test)
// ---------------------------------------------------------------------------
function hasTransparency(doc) {
    if (doc.layers.length > 1) {
        try { doc.mergeVisibleLayers(); } catch (e) { }
    }
    return !doc.layers[0].isBackgroundLayer;
}

// ---------------------------------------------------------------------------
// Native WebP export via Action Manager (the DOM has no WebPSaveOptions)
// ---------------------------------------------------------------------------
function saveAsWebP(doc, file, quality) {
    var desc = new ActionDescriptor();
    var opts = new ActionDescriptor();

    opts.putEnumerated(s2t("compression"), s2t("WebPCompression"), s2t("compressionLossy"));
    opts.putInteger(s2t("quality"), quality); // 0-100
    opts.putBoolean(s2t("includeXMPData"), false);
    opts.putBoolean(s2t("includeEXIFData"), false);
    opts.putBoolean(s2t("includePsExtras"), false);

    desc.putObject(s2t("as"), s2t("WebPFormat"), opts);
    desc.putPath(s2t("in"), file);
    desc.putBoolean(s2t("copy"), true);
    desc.putBoolean(s2t("lowerCase"), true);

    executeAction(s2t("save"), desc, DialogModes.NO);
}

// ---------------------------------------------------------------------------
// Process one file
// ---------------------------------------------------------------------------
function processFile(file, outputFolder, expandPx, quality, targetSize) {
    var doc = open(file);

    try {
        if (doc.mode !== DocumentMode.RGB) {
            doc.changeMode(ChangeMode.RGB);
        }

        var w = doc.width.as("px");
        var h = doc.height.as("px");
        var maxDim = Math.max(w, h);
        var transparent = hasTransparency(doc);
        var needsSquaring = (w !== h);

        if (needsSquaring) {
            doc.resizeCanvas(maxDim, maxDim, AnchorPosition.MIDDLECENTER);

            if (transparent) {
                fillTransparencyWithWhite(doc);
            } else {
                selectPadding(doc, w, h, maxDim);

                var maxExpand = Math.floor(Math.min(w, h) / 2) - 1;
                var expandAmt = Math.max(0, Math.min(expandPx, maxExpand));
                if (expandAmt > 0) {
                    doc.selection.expand(expandAmt);
                }

                contentAwareFillSelection();
                doc.selection.deselect();
            }
        } else if (transparent) {
            // Already square, but still needs its transparent pixels whited out
            fillTransparencyWithWhite(doc);
        }

        if (targetSize) {
            doc.resizeImage(targetSize, targetSize, doc.resolution, ResampleMethod.BICUBICSHARPER);
        }

        // Safety net: collapse to one layer before export
        try {
            if (doc.layers.length > 1) doc.flatten();
        } catch (e) { }

        try {
            doc.convertProfile("sRGB IEC61966-2.1", Intent.RELATIVECOLORIMETRIC, true, false);
        } catch (e) { }
        doc.bitsPerChannel = BitsPerChannelType.EIGHT;

        var baseName = doc.name.replace(/\.[^\.]+$/, "");
        var outFile = new File(outputFolder.fsName + "/" + baseName + ".webp");
        saveAsWebP(doc, outFile, quality);

        doc.close(SaveOptions.DONOTSAVECHANGES);
        return { ok: true };
    } catch (err) {
        try { doc.close(SaveOptions.DONOTSAVECHANGES); } catch (e2) { }
        return { ok: false, error: err.toString() };
    }
}

// ---------------------------------------------------------------------------
// Batch runner
// ---------------------------------------------------------------------------
function processBatch(inputFolder, outputFolder, expandPx, quality, targetSize, statusText, progBar, win) {
    var fileList = inputFolder.getFiles(/\.(jpg|jpeg|png|tif|tiff|bmp|psd|webp)$/i);
    var errors = [];
    progBar.value = 0;
    progBar.maxvalue = fileList.length;

    for (var i = 0; i < fileList.length; i++) {
        var f = fileList[i];
        if (!(f instanceof File)) continue;

        statusText.text = "Processing " + (i + 1) + " / " + fileList.length + ":  " + f.name;
        progBar.value = i;
        win.update();
        app.refresh();

        var result = processFile(f, outputFolder, expandPx, quality, targetSize);
        if (!result.ok) {
            errors.push(f.name + " -> " + result.error);
        }
    }

    progBar.value = fileList.length;
    statusText.text = "Done.";

    var msg = "Batch complete.\n" + fileList.length + " file(s) processed.";
    if (errors.length > 0) {
        msg += "\n\n" + errors.length + " error(s):\n" + errors.join("\n");
    }
    alert(msg);
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------
function buildUI() {
    var win = new Window("dialog", "Square + Fill + WebP Batch Tool");
    win.orientation = "column";
    win.alignChildren = "fill";
    win.margins = 16;
    win.spacing = 10;

    // Input folder
    var inGroup = win.add("group");
    inGroup.orientation = "row";
    var inLabel = inGroup.add("statictext", undefined, "Input folder:");
    inLabel.preferredSize.width = 90;
    var inputPathText = inGroup.add("edittext", undefined, "");
    inputPathText.characters = 35;
    var inBrowseBtn = inGroup.add("button", undefined, "Browse...");

    // Output folder
    var outGroup = win.add("group");
    outGroup.orientation = "row";
    var outLabel = outGroup.add("statictext", undefined, "Output folder:");
    outLabel.preferredSize.width = 90;
    var outputPathText = outGroup.add("edittext", undefined, "");
    outputPathText.characters = 35;
    var outBrowseBtn = outGroup.add("button", undefined, "Browse...");

    // Options
    var optPanel = win.add("panel", undefined, "Options");
    optPanel.orientation = "column";
    optPanel.alignChildren = "left";
    optPanel.margins = 12;
    optPanel.spacing = 8;

    var expandGroup = optPanel.add("group");
    expandGroup.add("statictext", undefined, "Content-aware fill: expand selection inward by (px):");
    var expandInput = expandGroup.add("edittext", undefined, "5");
    expandInput.characters = 6;

    var qualityGroup = optPanel.add("group");
    qualityGroup.add("statictext", undefined, "WebP quality (0-100):");
    var qualityInput = qualityGroup.add("edittext", undefined, "95");
    qualityInput.characters = 6;

    var resizeGroup = optPanel.add("group");
    var resizeCheck = resizeGroup.add("checkbox", undefined, "Resize final square to (px):");
    var resizeInput = resizeGroup.add("edittext", undefined, "2000");
    resizeInput.characters = 6;
    resizeInput.enabled = false;
    resizeCheck.onClick = function () {
        resizeInput.enabled = resizeCheck.value;
    };

    // Progress
    var progGroup = win.add("group");
    progGroup.orientation = "column";
    progGroup.alignChildren = "fill";
    var statusText = progGroup.add("statictext", undefined, "Ready.");
    statusText.characters = 55;
    var progBar = progGroup.add("progressbar", undefined, 0, 100);
    progBar.preferredSize.width = 420;

    // Buttons
    var btnGroup = win.add("group");
    btnGroup.alignment = "right";
    var cancelBtn = btnGroup.add("button", undefined, "Cancel", { name: "cancel" });
    var runBtn = btnGroup.add("button", undefined, "Run", { name: "ok" });

    inBrowseBtn.onClick = function () {
        var f = Folder.selectDialog("Select the folder with images to process:");
        if (f) inputPathText.text = f.fsName;
    };
    outBrowseBtn.onClick = function () {
        var f = Folder.selectDialog("Select the folder to save the results to:");
        if (f) outputPathText.text = f.fsName;
    };
    cancelBtn.onClick = function () {
        win.close(0);
    };

    runBtn.onClick = function () {
        var versionNumber = app.version.split(".");
        if (parseInt(versionNumber[0], 10) < 23) {
            alert("This script needs Photoshop 23.2 (2022) or later for native WebP export.");
            return;
        }

        if (!inputPathText.text) {
            alert("Please choose an input folder.");
            return;
        }
        var inputFolder = new Folder(inputPathText.text);
        if (!inputFolder.exists) {
            alert("Input folder does not exist.");
            return;
        }
        if (!outputPathText.text) {
            alert("Please choose an output folder.");
            return;
        }
        var outputFolder = new Folder(outputPathText.text);
        if (!outputFolder.exists) outputFolder.create();

        var expandPx = parseInt(expandInput.text, 10);
        if (isNaN(expandPx) || expandPx < 0) expandPx = 0;

        var quality = parseInt(qualityInput.text, 10);
        if (isNaN(quality)) quality = 85;
        quality = Math.max(0, Math.min(100, quality));

        var targetSize = null;
        if (resizeCheck.value) {
            targetSize = parseInt(resizeInput.text, 10);
            if (isNaN(targetSize) || targetSize <= 0) targetSize = null;
        }

        runBtn.enabled = false;
        cancelBtn.enabled = "Close";
        inBrowseBtn.enabled = false;
        outBrowseBtn.enabled = false;

        processBatch(inputFolder, outputFolder, expandPx, quality, targetSize, statusText, progBar, win);

        // win.close(1);
    };

    win.center();
    win.show();
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
function main() {
    var originalRulerUnits = app.preferences.rulerUnits;
    var originalDisplayDialogs = app.displayDialogs;
    var originalBackground = app.backgroundColor;

    app.preferences.rulerUnits = Units.PIXELS;
    app.displayDialogs = DialogModes.NO;

    try {
        buildUI();
    } finally {
        app.preferences.rulerUnits = originalRulerUnits;
        app.displayDialogs = originalDisplayDialogs;
        app.backgroundColor = originalBackground;
    }
}

main();