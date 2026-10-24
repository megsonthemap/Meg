// facebox <image.png> [more.png ...]
// Prints one JSON line per image: {"file":"...","faces":[{"x":0.3,"y":0.1,"w":0.2,"h":0.14}]}
// Boxes are fractions of the image, origin top-left. Used by `reel.mjs check` to find out whether a
// caption, hook, label or b-roll band is sitting on her face.
import Vision
import CoreImage
import ImageIO

let args = Array(CommandLine.arguments.dropFirst())
guard !args.isEmpty else { print("usage: facebox image.png [image.png ...]"); exit(1) }
for file in args {
  var boxes: [String] = []
  if let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: file) as CFURL, nil),
     let cg = CGImageSourceCreateImageAtIndex(src, 0, nil) {
    let req = VNDetectFaceRectanglesRequest()
    try? VNImageRequestHandler(cgImage: cg).perform([req])
    for f in req.results ?? [] {
      let b = f.boundingBox // normalised, origin bottom-left
      boxes.append(String(format: "{\"x\":%.4f,\"y\":%.4f,\"w\":%.4f,\"h\":%.4f}", b.minX, 1 - b.maxY, b.width, b.height))
    }
  }
  print("{\"file\":\"\(file)\",\"faces\":[\(boxes.joined(separator: ","))]}")
}
