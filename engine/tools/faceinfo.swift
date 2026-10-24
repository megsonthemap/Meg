// faceinfo <image> [more ...]
// One JSON line per image: {"file":"...","faces":[{"x","y","w","h","q","mouth","eyes","smile","yaw","roll"}]}
// Box is fractions of the image, origin top-left. q = Vision face capture quality (0..1: sharp, lit,
// eyes open). mouth = inner-lip gap / mouth width (0 closed, >0.15 talking). eyes = eye height / width
// averaged (<0.18 half shut). smile = how far the mouth corners sit above the lip centre, / mouth width.
// Used by cover.mjs to pick cover frames. Mac only (Apple Vision).
import Vision
import ImageIO

func pts(_ r: VNFaceLandmarkRegion2D?, _ size: CGSize) -> [CGPoint] { r.map { $0.pointsInImage(imageSize: size).map { CGPoint(x: $0.x, y: size.height - $0.y) } } ?? [] }
func span(_ p: [CGPoint]) -> (w: Double, h: Double) {
  guard let x0 = p.map({ $0.x }).min(), let x1 = p.map({ $0.x }).max(), let y0 = p.map({ $0.y }).min(), let y1 = p.map({ $0.y }).max() else { return (0, 0) }
  return (Double(x1 - x0), Double(y1 - y0))
}
let args = Array(CommandLine.arguments.dropFirst())
guard !args.isEmpty else { print("usage: faceinfo image.jpg [image.jpg ...]"); exit(1) }
for file in args {
  var out: [String] = []
  if let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: file) as CFURL, nil),
     let cg = CGImageSourceCreateImageAtIndex(src, 0, nil) {
    let size = CGSize(width: cg.width, height: cg.height)
    let lm = VNDetectFaceLandmarksRequest()
    let h = VNImageRequestHandler(cgImage: cg)
    try? h.perform([lm])
    let faces = lm.results ?? []
    let qr = VNDetectFaceCaptureQualityRequest()
    qr.inputFaceObservations = faces
    try? h.perform([qr])
    for (i, f) in faces.enumerated() {
      let b = f.boundingBox
      let q = (qr.results?.count ?? 0) > i ? Double(qr.results![i].faceCaptureQuality ?? 0) : -1
      var mouth = -1.0, eyes = -1.0, smile = 0.0
      if let l = f.landmarks {
        let inner = pts(l.innerLips, size), outer = pts(l.outerLips, size)
        let ow = span(outer).w
        if ow > 0 { mouth = span(inner).h / ow }
        let le = span(pts(l.leftEye, size)), re = span(pts(l.rightEye, size))
        if le.w > 0 && re.w > 0 { eyes = (le.h / le.w + re.h / re.w) / 2 }
        if outer.count > 2, ow > 0 {
          let left = outer.min { $0.x < $1.x }!, right = outer.max { $0.x < $1.x }!
          let cy = outer.map { Double($0.y) }.reduce(0, +) / Double(outer.count)
          smile = (cy - Double(left.y + right.y) / 2) / ow
        }
      }
      out.append(String(format: "{\"x\":%.4f,\"y\":%.4f,\"w\":%.4f,\"h\":%.4f,\"q\":%.3f,\"mouth\":%.3f,\"eyes\":%.3f,\"smile\":%.3f,\"yaw\":%.3f,\"roll\":%.3f}",
        b.minX, 1 - b.maxY, b.width, b.height, q, mouth, eyes, smile, f.yaw?.doubleValue ?? 0, f.roll?.doubleValue ?? 0))
    }
  }
  print("{\"file\":\"\(file)\",\"faces\":[\(out.joined(separator: ","))]}")
}
