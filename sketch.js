// Global variables for p5.js
let img;
let scaledImg;
let mainCanvas;

// Data storage
let cols, rows;
let pointsByBrightnessLevel = [];

// DOM elements references
let imageUploadInput;
let numLayersInput;
let gridSizeInput;
let pointDiameterInput; // NEW: Added input for point diameter
let zPointInput;
let zTravelInput;
let feedRateXYInput;
let feedRateZInput;
let plotterSizeSelect;
let customSizeInputs;
let customWidthInput;
let customHeightInput;
let generateGCodeBtn;
let downloadAllBtn;
let gcodeOutputSection;

let plotterDims = { width: 210, height: 297 };
let previewWidth = 600;
let previewHeight = 400;

// p5.js setup function
function setup() {
    mainCanvas = createCanvas(previewWidth * 2, previewHeight);
    mainCanvas.parent('p5Canvas');
    pixelDensity(1);

    imageUploadInput = select('#imageUpload');
    numLayersInput = select('#numLayers');
    gridSizeInput = select('#gridSize');
    pointDiameterInput = select('#pointDiameter'); // NEW: Select the new input
    zPointInput = select('#zPoint');
    zTravelInput = select('#zTravel');
    feedRateXYInput = select('#feedRateXY');
    feedRateZInput = select('#feedRateZ');
    plotterSizeSelect = select('#plotterSize');
    customSizeInputs = select('#customSizeInputs');
    customWidthInput = select('#customWidth');
    customHeightInput = select('#customHeight');
    generateGCodeBtn = select('#generateGCode');
    downloadAllBtn = select('#downloadAll');
    gcodeOutputSection = select('#gcode-output-section');

    if (imageUploadInput) {
        imageUploadInput.elt.addEventListener('change', handleImageUpload);
    }
    generateGCodeBtn.mousePressed(generateGCode);
    downloadAllBtn.mousePressed(downloadAllGCode);
    plotterSizeSelect.changed(handlePlotterSizeChange);

    handlePlotterSizeChange();

    drawInitialText('Upload an image to begin');
    
    noLoop();
}

function drawInitialText(message) {
    background(240);
    textAlign(CENTER, CENTER);
    textSize(20);
    fill(100);
    text(message, width / 2, height / 2);
}

function handleImageUpload(event) {
    const file = event.target.files[0];
    
    if (file && file.type.startsWith('image')) {
        const reader = new FileReader();
        reader.onload = function(e) {
            loadImage(e.target.result, loadedImage => {
                img = loadedImage;
                let displayHeight = img.height * (previewWidth / img.width);
                if (displayHeight > previewHeight) {
                    displayHeight = previewHeight;
                    previewWidth = img.width * (displayHeight / img.height);
                }
                resizeCanvas(previewWidth * 2, displayHeight);
                redraw();
            });
        };
        reader.readAsDataURL(file);
    } else {
        img = null;
        resizeCanvas(400 * 2, 400);
        drawInitialText('Please upload an image file');
    }
}

function handlePlotterSizeChange() {
    const selectedSize = plotterSizeSelect.value();
    if (selectedSize === 'A4') {
        plotterDims = { width: 210, height: 297 };
        customSizeInputs.style('display', 'none');
    } else if (selectedSize === 'A3') {
        plotterDims = { width: 297, height: 420 };
        customSizeInputs.style('display', 'none');
    } else if (selectedSize === 'A2') {
        plotterDims = { width: 420, height: 594 };
        customSizeInputs.style('display', 'none');
    } else if (selectedSize === 'Custom') {
        customSizeInputs.style('display', 'block');
        plotterDims = { width: float(customWidthInput.value()), height: float(customHeightInput.value()) };
    }
    print('Plotter dimensions set to:', plotterDims.width, 'x', plotterDims.height, 'mm');
}

function generateGCode() {
    if (!img) {
        alert('Please upload an image first!');
        return;
    }

    const numLayers = int(numLayersInput.value());
    const gridSize = int(gridSizeInput.value());
    const zPoint = float(zPointInput.value());
    const zTravel = float(zTravelInput.value());
    const feedRateXY = float(feedRateXYInput.value());
    const feedRateZ = float(feedRateZInput.value());

    if (numLayers <= 0 || gridSize <= 0 || feedRateXY <= 0 || feedRateZ <= 0) {
        alert('Please enter valid positive numbers for all parameters.');
        return;
    }

    if (plotterSizeSelect.value() === 'Custom') {
        plotterDims = { 
            width: float(customWidthInput.value()), 
            height: float(customHeightInput.value()) 
        };
        if (plotterDims.width <= 0 || plotterDims.height <= 0) {
            alert('Please enter valid positive numbers for custom plotter dimensions.');
            return;
        }
    }
    
    scaledImg = createImage(plotterDims.width, plotterDims.height);
    scaledImg.copy(img, 0, 0, img.width, img.height, 0, 0, scaledImg.width, scaledImg.height);
    
    scaledImg.filter(GRAY);
    scaledImg.loadPixels();
    
    pointsByBrightnessLevel = [];
    gcodeOutputSection.html('');

    for (let i = 0; i < numLayers; i++) {
        pointsByBrightnessLevel[i] = [];
    }

    cols = floor(plotterDims.width / gridSize);
    rows = floor(plotterDims.height / gridSize);

    for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
            let xPlotter = i * gridSize + gridSize / 2;
            let yPlotter = j * gridSize + gridSize / 2;

            let xPixel = floor(map(xPlotter, 0, plotterDims.width, 0, scaledImg.width));
            let yPixel = floor(map(yPlotter, 0, plotterDims.height, 0, scaledImg.height));
            
            let c = scaledImg.get(xPixel, yPixel);
            let b = brightness(c);

            let levelIndex = floor(map(b, 0, 100, 0, numLayers - 0.0001));
            levelIndex = constrain(levelIndex, 0, numLayers - 1);

            pointsByBrightnessLevel[levelIndex].push({ x: xPlotter, y: yPlotter, brightness: b });
        }
    }

    print("Points sampled and sorted into", numLayers, "brightness levels.");
    redraw();
    
    for (let level = 0; level < numLayers; level++) {
        const gcode = generateGCodeForLevel(level, zPoint, zTravel, feedRateXY, feedRateZ);
        displayGCode(level, gcode);
    }
}

function generateGCodeForLevel(level, zPoint, zTravel, feedRateXY, feedRateZ) {
    let gcode = [];
    
    gcode.push('G21 ; Set units to millimeters');
    gcode.push('G90 ; Use absolute positioning');
    gcode.push('G28 ; Home all axes');

    gcode.push(`G01 Z${zTravel.toFixed(3)} F${feedRateZ} ; Move to safe Z travel height`);

    const points = pointsByBrightnessLevel[level];

    for (let i = 0; i < points.length; i++) {
        let p = points[i];

        let gx = p.x;
        let gy = (plotterDims.height - p.y) + 50; /// PUNTO INICIO Y
        
        gcode.push(`G00 X${gx.toFixed(3)} Y${gy.toFixed(3)} F${feedRateXY} ; Move to point`);
        gcode.push(`G01 Z${zPoint.toFixed(3)} F${feedRateZ} ; Plunge/Mark point`);
        gcode.push(`G01 Z${zTravel.toFixed(3)} F${feedRateZ} ; Lift tool`);
    }

    gcode.push(`G00 X1 Y${(plotterDims.height - 1).toFixed(3)} Z${(zTravel + 10).toFixed(3)} F${feedRateXY} ; Move to parking position`);
    gcode.push('G01 X0 Y550');
    gcode.push('G01 Z0');
    gcode.push('M02 ; End of program');

    return gcode.join('\n');
}

function displayGCode(level, gcode) {
    const div = createElement('div', `<label>G-Code for Brightness Level ${level}:</label>`);
    div.class('gcode-output-group');
    const textarea = createElement('textarea', gcode);
    textarea.attribute('readonly', '');
    textarea.id(`gcode-level-${level}`);
    
    div.child(textarea);
    gcodeOutputSection.child(div);
}

function downloadAllGCode() {
    const numLayers = int(numLayersInput.value());
    for (let level = 0; level < numLayers; level++) {
        const textarea = select(`#gcode-level-${level}`);
        if (textarea) {
            const gcodeContent = textarea.value();
            const fileName = `brightness_level_${level}.gcode`;
            saveStrings([gcodeContent], fileName, 'gcode');
        }
    }
}

function draw() {
    background(220);

    let imagePreviewX = 0;
    let pointsPreviewX = width / 2;

    if (img) {
        // --- Preview on the left side: Original image + red point grid ---
        image(img, imagePreviewX, 0, width / 2, height);
        
        noFill();
        stroke(255, 0, 0, 100);
        strokeWeight(1); 

        if (pointsByBrightnessLevel.length > 0) {
            for (let level = 0; level < pointsByBrightnessLevel.length; level++) {
                for (let i = 0; i < pointsByBrightnessLevel[level].length; i++) {
                    let p = pointsByBrightnessLevel[level][i];
                    let displayX = map(p.x, 0, plotterDims.width, imagePreviewX, width / 2);
                    let displayY = map(p.y, 0, plotterDims.height, 0, height);
                    point(displayX, displayY);
                }
            }
        }
        
        // --- Preview on the right side: Grayscale points only ---
        noStroke();
        fill(255);
        rect(pointsPreviewX, 0, width / 2, height);
        
        // Get the point diameter from the user input.
        const dotDiameter = (pointDiameterInput && !isNaN(float(pointDiameterInput.value()))) ? float(pointDiameterInput.value()) : 2;
        
        if (pointsByBrightnessLevel.length > 0) {
            for (let level = 0; level < pointsByBrightnessLevel.length; level++) {
                const grayValue = map(level, 0, pointsByBrightnessLevel.length - 1, 0, 255);
                fill(grayValue);
                
                for (let i = 0; i < pointsByBrightnessLevel[level].length; i++) {
                    let p = pointsByBrightnessLevel[level][i];

                    let displayX = map(p.x, 0, plotterDims.width, pointsPreviewX, width);
                    let displayY = map(p.y, 0, plotterDims.height, 0, height);
                    
                    const dotRadiusOnCanvas = map(dotDiameter, 0, plotterDims.width, 0, width / 2);
                    
                    ellipse(displayX, displayY, dotRadiusOnCanvas, dotRadiusOnCanvas);
                }
            }
        } else {
            let previewMessage = 'Points preview will appear here';
            let messageX = pointsPreviewX + (width / 4);
            let messageY = height / 2;
            fill(100);
            textAlign(CENTER, CENTER);
            textSize(20);
            text(previewMessage, messageX, messageY);
        }
    } else {
        drawInitialText('Upload an image and click Generate');
    }
}