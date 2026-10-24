// cutimg <in.jpg|png> <out.png> : foreground subject(s) on transparent background, cropped to subject
import Vision
import CoreImage
import AppKit
let a = CommandLine.arguments
guard a.count == 3, let src = CIImage(contentsOf: URL(fileURLWithPath: a[1])) else { print("usage: cutimg in out.png"); exit(1) }
let ctx = CIContext()
let cg = ctx.createCGImage(src, from: src.extent)!
let req = VNGenerateForegroundInstanceMaskRequest()
let h = VNImageRequestHandler(cgImage: cg)
try h.perform([req])
guard let r = req.results?.first else { print("no subject"); exit(2) }
let mask = try r.generateScaledMaskForImage(forInstances: r.allInstances, from: h)
let m = CIImage(cvPixelBuffer: mask)
let out = src.applyingFilter("CIBlendWithMask", parameters: [kCIInputBackgroundImageKey: CIImage(color: .clear).cropped(to: src.extent), kCIInputMaskImageKey: m])
// crop to opaque bounds
let full = ctx.createCGImage(out, from: out.extent)!
let w = full.width, hh = full.height
var data = [UInt8](repeating: 0, count: w * hh * 4)
let cs = CGColorSpaceCreateDeviceRGB()
let bctx = CGContext(data: &data, width: w, height: hh, bitsPerComponent: 8, bytesPerRow: w * 4, space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
bctx.draw(full, in: CGRect(x: 0, y: 0, width: w, height: hh))
var minX = w, minY = hh, maxX = 0, maxY = 0
for y in 0..<hh { for x in 0..<w where data[(y * w + x) * 4 + 3] > 10 { minX = min(minX, x); maxX = max(maxX, x); minY = min(minY, y); maxY = max(maxY, y) } }
let crop = full.cropping(to: CGRect(x: minX, y: minY, width: max(1, maxX - minX), height: max(1, maxY - minY)))!
let rep = NSBitmapImageRep(cgImage: crop)
try rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: a[2]))
print("ok \(crop.width)x\(crop.height)")
