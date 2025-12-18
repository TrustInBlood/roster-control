import { useState, useRef, useCallback } from 'react'
import ReactCrop, { type Crop, type PixelCrop, centerCrop, makeAspectCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import { X, Check, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'

interface ImageCropperProps {
  imageSrc: string
  onCropComplete: (croppedBlob: Blob) => void
  onCancel: () => void
  targetWidth?: number
  targetHeight?: number
}

// Helper to create a centered crop with aspect ratio
function centerAspectCrop(
  mediaWidth: number,
  mediaHeight: number,
  aspect: number
): Crop {
  return centerCrop(
    makeAspectCrop(
      {
        unit: '%',
        width: 90,
      },
      aspect,
      mediaWidth,
      mediaHeight
    ),
    mediaWidth,
    mediaHeight
  )
}

export default function ImageCropper({
  imageSrc,
  onCropComplete,
  onCancel,
  targetWidth = 2048,
  targetHeight = 512,
}: ImageCropperProps) {
  const imgRef = useRef<HTMLImageElement>(null)
  const [crop, setCrop] = useState<Crop>()
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>()
  const [scale, setScale] = useState(1)
  const [isProcessing, setIsProcessing] = useState(false)

  const aspect = targetWidth / targetHeight // 4:1

  // Store the fixed crop dimensions
  const [fixedCropSize, setFixedCropSize] = useState<{ width: number; height: number } | null>(null)

  const onImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const { width, height } = e.currentTarget
      const initialCrop = centerAspectCrop(width, height, aspect)
      setCrop(initialCrop)
      // Store the initial size to prevent resizing
      setFixedCropSize({ width: initialCrop.width, height: initialCrop.height })
    },
    [aspect]
  )

  // Handle crop change - only allow position changes, not size changes
  const handleCropChange = useCallback(
    (_: PixelCrop, percentCrop: Crop) => {
      if (fixedCropSize) {
        // Keep the size fixed, only allow position to change
        setCrop({
          ...percentCrop,
          width: fixedCropSize.width,
          height: fixedCropSize.height,
        })
      } else {
        setCrop(percentCrop)
      }
    },
    [fixedCropSize]
  )

  const getCroppedImg = useCallback(async (): Promise<Blob | null> => {
    const image = imgRef.current
    if (!image || !completedCrop) return null

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    // Set canvas to target dimensions
    canvas.width = targetWidth
    canvas.height = targetHeight

    // Calculate the scale factor between displayed and natural image size
    const scaleX = image.naturalWidth / image.width
    const scaleY = image.naturalHeight / image.height

    // Calculate crop coordinates in natural image coordinates
    const cropX = completedCrop.x * scaleX
    const cropY = completedCrop.y * scaleY
    const cropWidth = completedCrop.width * scaleX
    const cropHeight = completedCrop.height * scaleY

    // Draw the cropped portion scaled to target dimensions
    ctx.drawImage(
      image,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      0,
      0,
      targetWidth,
      targetHeight
    )

    return new Promise((resolve) => {
      canvas.toBlob(
        (blob) => resolve(blob),
        'image/png',
        1
      )
    })
  }, [completedCrop, targetWidth, targetHeight])

  const handleApply = async () => {
    setIsProcessing(true)
    try {
      const croppedBlob = await getCroppedImg()
      if (croppedBlob) {
        onCropComplete(croppedBlob)
      }
    } finally {
      setIsProcessing(false)
    }
  }

  const handleReset = () => {
    setScale(1)
    if (imgRef.current) {
      const { width, height } = imgRef.current
      setCrop(centerAspectCrop(width, height, aspect))
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-discord-light rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b border-discord-lighter flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">Crop Image</h3>
            <p className="text-sm text-gray-400">
              Select the area to use for the template ({targetWidth}x{targetHeight})
            </p>
          </div>
          <button
            onClick={onCancel}
            className="p-2 text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Crop Area */}
        <div className="flex-1 overflow-auto p-4 bg-discord-darker flex items-center justify-center min-h-0">
          <ReactCrop
            crop={crop}
            onChange={handleCropChange}
            onComplete={(c) => setCompletedCrop(c)}
            aspect={aspect}
            className="max-h-full"
          >
            <img
              ref={imgRef}
              src={imageSrc}
              alt="Crop preview"
              onLoad={onImageLoad}
              style={{
                transform: `scale(${scale})`,
                maxHeight: '60vh',
                maxWidth: '100%',
              }}
              className="object-contain"
            />
          </ReactCrop>
        </div>

        {/* Controls */}
        <div className="px-4 py-3 border-t border-discord-lighter">
          <div className="flex items-center justify-between">
            {/* Zoom Controls */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-400">Zoom:</span>
              <button
                onClick={() => setScale((s) => Math.max(0.5, s - 0.1))}
                className="p-2 text-gray-400 hover:text-white bg-discord-darker rounded transition-colors"
                title="Zoom out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-sm text-white w-12 text-center">
                {Math.round(scale * 100)}%
              </span>
              <button
                onClick={() => setScale((s) => Math.min(3, s + 0.1))}
                className="p-2 text-gray-400 hover:text-white bg-discord-darker rounded transition-colors"
                title="Zoom in"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                onClick={handleReset}
                className="p-2 text-gray-400 hover:text-white bg-discord-darker rounded transition-colors ml-2"
                title="Reset"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3">
              <button
                onClick={onCancel}
                className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleApply}
                disabled={isProcessing || !completedCrop}
                className="flex items-center gap-2 bg-discord-blurple hover:bg-discord-blurple/80 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                {isProcessing ? 'Processing...' : 'Apply Crop'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
