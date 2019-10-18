const output = require('image-output')
const xml2js = require('xml2js');
const fs = require('fs');
const program = require('commander');

function generateArray(dims) {
  return new Array(dims).fill(1);
}

function generateGrid(dims) {
  return generateArray(dims).map((y, i) => generateArray(dims))
}

// fn: function(value, [xIndex, yIndex]) -> newValue
function gridMap(grid, fn) {
  return grid.map((row, rowIndex) => 
    row.map((value, columnIndex) => fn(value, [columnIndex, rowIndex]))
  )
}

// fn: function(value, [xIndex, yIndex]) -> newValue
function forEachCell(grid, fn) {
    return grid.forEach((row, rowIndex) => 
      row.forEach((value, columnIndex) => fn(value, [columnIndex, rowIndex]))
    )
}

// Catmull-Rom interpolation, based on:
// https://www.cs.cmu.edu/afs/cs/academic/class/15462-s09/www/lec/10/lec10.pdf
function catmullRom(t, p1, p2, p3, p4) {
  const s = 1/2;
  const a = -s*p1 + (2-s)*p2 + (s-2)*p3 + s*p4;
  const b = 2*s*p1 + (s-3)*p2 + (3-2*s)*p3 - s*p4;
  const c = -s*p1 + s*p3;
  const d = p2;
  return t*t*t*a + t*t*b + t*c + d;
}

function lerp(t, p1, p2) {
  return (1 - t) * p1 + t * p2;
}

// Sample a grid using 2 dimensional Catmull-Rom interpolation
function catmullRomSample(grid, x, y) {
  const xInt = Math.floor(x);
  const yInt = Math.floor(y);
  const xFrac = x - xInt;
  const yFrac = y - yInt;
  const dims = [grid[0].length, grid.length];

  // Create a 4x4 grid where catmull rom interpolation can be performed
  const p = gridMap(generateGrid(4), (v, [x, y]) => {
    const clampedI = Math.max(Math.min(xInt + x - 1, dims[0] - 1), 0);
    const clampedJ = Math.max(Math.min(yInt + y - 1, dims[1] - 1), 0);
    return grid[clampedJ][clampedI];
  });

  const x0 = catmullRom(xFrac, p[0][0][0], p[0][1][0], p[0][2][0], p[0][3][0]);
  const x1 = catmullRom(xFrac, p[1][0][0], p[1][1][0], p[1][2][0], p[1][3][0]);
  const x2 = catmullRom(xFrac, p[2][0][0], p[2][1][0], p[2][2][0], p[2][3][0]);
  const x3 = catmullRom(xFrac, p[3][0][0], p[3][1][0], p[3][2][0], p[3][3][0]);
  const xOut = catmullRom(yFrac, x0, x1, x2, x3);

  const y0 = catmullRom(xFrac, p[0][0][1], p[0][1][1], p[0][2][1], p[0][3][1]);
  const y1 = catmullRom(xFrac, p[1][0][1], p[1][1][1], p[1][2][1], p[1][3][1]);
  const y2 = catmullRom(xFrac, p[2][0][1], p[2][1][1], p[2][2][1], p[2][3][1]);
  const y3 = catmullRom(xFrac, p[3][0][1], p[3][1][1], p[3][2][1], p[3][3][1]);
  const yOut = catmullRom(yFrac, y0, y1, y2, y3);

  return [xOut, yOut];
}

function linearSample(grid, x, y) {
  const xInt = Math.floor(x);
  const yInt = Math.floor(y);
  const xFrac = x - xInt;
  const yFrac = y - yInt;
  const dims = [grid[0].length, grid.length];

  // Create a 2x2 grid where linear interpolation can be performed
  const p = gridMap(generateGrid(2), (v, [x, y]) => {
    const clampedI = Math.max(Math.min(xInt + x, dims[0] - 1), 0);
    const clampedJ = Math.max(Math.min(yInt + y, dims[1] - 1), 0);
    return grid[clampedJ][clampedI];
  });

  const x0 = lerp(xFrac, p[0][0][0], p[0][1][0]);
  const x1 = lerp(xFrac, p[1][0][0], p[1][1][0]);
  const xOut = lerp(yFrac, x0, x1);
  
  const y0 = lerp(xFrac, p[0][0][1], p[0][1][1]);
  const y1 = lerp(xFrac, p[1][0][1], p[1][1][1]);
  const yOut = lerp(yFrac, y0, y1);
  
  return [xOut, yOut];
}


function outputGridToImage(grid, filename) {
  const imageData = [];
  forEachCell(grid, value => {
    imageData.push(Math.max(Math.min(value[0] / 500 + 0.5, 1), 0));
    imageData.push(Math.max(Math.min(value[1] / 500 + 0.5, 1), 0));
    imageData.push(0);
    imageData.push(1);
  });
  
  output({
    data: imageData,
    width: grid[0].length,
    height: grid.length
  }, filename);
}

program
  .version('0.1.0')
  .option('-i, --input <input>', 'Specify simcad input file path')
  .option('-o, --output <output>', 'Specify simcad output file path')
  .option('-u, --upsample <u>', 'Specify upsample factor')
  .parse(process.argv);

if (!program.input) {
  console.error('No input file specified. Type --help for more info.');
  process.exit();
}
if (!program.output) {
  console.error('No output file specified. Type --help for more info.');
  process.exit();
}

const defaultUpsampleFactor = 2;

if (!program.upsample) {
  console.warn(
    'No upsampling factor specified. Defaulting to ' +
    defaultUpsampleFactor + '. Type --help for more info.'
  );
}
const upsampleFactor = program.upsample || defaultUpsampleFactor;

const input = fs.readFileSync(program.input, 'utf-8');
xml2js.parseString(input, function(err, result) {

  const geometry = result.GeometryFile.GeometryDefinition[0];
  xPoints = geometry['X-FlatParameters'][0]._.split(' ').map(n => +n);
  yPoints = geometry['Y-FlatParameters'][0]._.split(' ').map(n => +n);

  const originalDimensions = Math.round(Math.sqrt(xPoints.length));

  // Merge the two point arrays
  const points = xPoints.map((x, index) => [x, yPoints[index]]);

  // Split the data into an array of rows,
  // with <originalDimensions> number of [x, y] points in each, i.e. a `grid`.
  const originalGrid = generateArray(originalDimensions).map((v, i) => {
    return points.slice(i * originalDimensions, (i + 1) * originalDimensions);
  });
  
  const newGridTemplate = generateGrid(Math.floor((originalDimensions - 1) * upsampleFactor) + 1);

  const catmullRomGrid = gridMap(newGridTemplate, (v, gridIndex) => {
    const x = gridIndex[0] / upsampleFactor;
    const y = gridIndex[1] / upsampleFactor;
    return catmullRomSample(originalGrid, x, y);
  });

  const linearGrid = gridMap(newGridTemplate, (v, gridIndex) => {
    const x = gridIndex[0] / upsampleFactor;
    const y = gridIndex[1] / upsampleFactor;
    return linearSample(originalGrid, x, y);
  });

  outputGridToImage(originalGrid, program.input + '.png');
  outputGridToImage(linearGrid, program.output + '.linear.png');
  outputGridToImage(catmullRomGrid, program.output + '.png');

  const differenceGrid = gridMap(catmullRomGrid, (value, [xIndex, yIndex]) => [
    (value[0] - linearGrid[yIndex][xIndex][0]) * 500,
    (value[1] - linearGrid[yIndex][xIndex][1]) * 500
  ]);
  outputGridToImage(differenceGrid, program.output + '.difference.png');

  const catmullRomXPoints = [], catmullRomYPoints = [];
  forEachCell(catmullRomGrid, (value) => {
    catmullRomXPoints.push(value[0]);
    catmullRomYPoints.push(value[1]);
  });
 
  result.GeometryFile.GeometryDefinition[0]['X-FlatParameters'][0]._ = catmullRomXPoints.join(' ');
  result.GeometryFile.GeometryDefinition[0]['Y-FlatParameters'][0]._ = catmullRomYPoints.join(' ');

  const builder = new xml2js.Builder();
  const outputXml = builder.buildObject(result);

  fs.writeFileSync(program.output, outputXml);
});
