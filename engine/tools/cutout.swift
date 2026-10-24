// cutout <video> <startSec> <durSec> <outDir> [fps]
// Writes person-only RGBA PNGs (frame_00000.png ...) for text-behind-subject effects.
import AVFoundation
import Vision
import CoreImage
import ImageIO
import UniformTypeIdentifiers

let a = CommandLine.arguments
guard a.count >= 5 else { print("usage: cutout video start dur outDir [fps]"); exit(1) }
let url = URL(fileURLWithPath: a[1]); let start = Double(a[2])!; let dur = Double(a[3])!
let outDir = URL(fileURLWithPath: a[4]); let fps = a.count > 5 ? Double(a[5])! : 30
let offset = a.count > 6 ? Int(a[6])! : 0
try? FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)
let asset = AVURLAsset(url: url)
let gen = AVAssetImageGenerator(asset: asset)
gen.appliesPreferredTrackTransform = true
gen.requestedTimeToleranceBefore = .zero; gen.requestedTimeToleranceAfter = .zero
let ctx = CIContext()
let n = Int((dur * fps).rounded())
for i in 0..<n {
  let t = CMTime(seconds: start + Double(i) / fps, preferredTimescale: 600)
  guard let cg = try? gen.copyCGImage(at: t, actualTime: nil) else { continue }
  let req = VNGeneratePersonSegmentationRequest()
  req.qualityLevel = .accurate
  req.outputPixelFormat = kCVPixelFormatType_OneComponent8
  let h = VNImageRequestHandler(cgImage: cg)
  try? h.perform([req])
  guard let mask = req.results?.first?.pixelBuffer else { continue }
  let src = CIImage(cgImage: cg)
  var m = CIImage(cvPixelBuffer: mask)
  m = m.transformed(by: CGAffineTransform(scaleX: src.extent.width / m.extent.width, y: src.extent.height / m.extent.height))
  let clear = CIImage(color: .clear).cropped(to: src.extent)
  let out = src.applyingFilter("CIBlendWithMask", parameters: [kCIInputBackgroundImageKey: clear, kCIInputMaskImageKey: m])
  let f = outDir.appendingPathComponent(String(format: "frame_%05d.png", i + offset))
  try? ctx.writePNGRepresentation(of: out, to: f, format: .RGBA8, colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!)
}
print("frames: \(n)")
