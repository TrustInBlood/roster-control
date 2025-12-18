import { useState, useRef, useEffect, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Save, Upload, RefreshCw, Move, Plus } from 'lucide-react'
import {
  useStatsTemplate,
  useCreateTemplate,
  useUpdateTemplate,
  useUpdateTemplateImage,
} from '../hooks/useStatsTemplates'
import { useAuth } from '../hooks/useAuth'
import { statsTemplatesApi } from '../lib/api'
import ImageCropper from '../components/ImageCropper'

const TARGET_WIDTH = 2048
const TARGET_HEIGHT = 512

// Sample stats for preview
const SAMPLE_STATS = {
  playerName: 'Sample Player',
  kills: 42,
  deaths: 15,
  kdRatio: 2.8,
  teamkills: 2,
  revivesGiven: 28,
  revivesReceived: 12,
  nemesis: 'Enemy_Player123',
}

export default function StatsTemplateEditor() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const canManage = hasPermission('MANAGE_STATS_TEMPLATES')

  const isNewTemplate = id === 'new'
  const templateId = id && id !== 'new' ? parseInt(id, 10) : null
  const { data, isLoading, refetch } = useStatsTemplate(isNewTemplate ? null : templateId)
  const createMutation = useCreateTemplate()
  const updateMutation = useUpdateTemplate()
  const updateImageMutation = useUpdateTemplateImage()

  // New template state
  const [newTemplateName, setNewTemplateName] = useState('')
  const [newTemplateImage, setNewTemplateImage] = useState<File | null>(null)
  const [newImagePreview, setNewImagePreview] = useState<string | null>(null)

  // Image cropper state
  const [showCropper, setShowCropper] = useState(false)
  const [cropperImageSrc, setCropperImageSrc] = useState<string | null>(null)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const templateImageRef = useRef<HTMLImageElement | null>(null)

  // Form state
  const [formData, setFormData] = useState({
    displayName: '',
    isActive: true,
    boxWidth: 800,
    boxHeight: 420,
    boxX: null as number | null,
    boxY: null as number | null,
    rightMargin: 80,
    padding: 25,
    titleSize: 28,
    labelSize: 18,
    valueSize: 26,
    rowGap: 12,
    topGap: 40,
    sectionGap: 40,
  })

  // Drag state
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)
  const [imageLoaded, setImageLoaded] = useState(false)

  // Initialize form data from template
  useEffect(() => {
    if (data?.template) {
      const t = data.template
      setFormData({
        displayName: t.displayName,
        isActive: t.isActive,
        boxWidth: t.boxWidth,
        boxHeight: t.boxHeight,
        boxX: t.boxX,
        boxY: t.boxY,
        rightMargin: t.rightMargin,
        padding: t.padding,
        titleSize: t.titleSize,
        labelSize: t.labelSize,
        valueSize: t.valueSize,
        rowGap: t.rowGap,
        topGap: t.topGap,
        sectionGap: t.sectionGap,
      })
    }
  }, [data])

  // Load template image
  useEffect(() => {
    if (templateId && !isNewTemplate) {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        templateImageRef.current = img
        setImageLoaded(true)
      }
      img.src = statsTemplatesApi.getImageUrl(templateId) + '?t=' + Date.now()
    }
  }, [templateId, isNewTemplate])

  // Calculate box position (auto if null)
  const getBoxPosition = useCallback(() => {
    const templateWidth = 2048
    const templateHeight = 512
    const boxX = formData.boxX !== null
      ? formData.boxX
      : templateWidth - formData.boxWidth - formData.rightMargin
    const boxY = formData.boxY !== null
      ? formData.boxY
      : (templateHeight - formData.boxHeight) / 2
    return { boxX, boxY }
  }, [formData])

  // Draw preview canvas
  const drawPreview = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container || !templateImageRef.current) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const img = templateImageRef.current
    const templateWidth = img.width
    const templateHeight = img.height

    // Calculate scale to fit container
    const containerWidth = container.clientWidth
    const newScale = containerWidth / templateWidth
    setScale(newScale)

    canvas.width = templateWidth * newScale
    canvas.height = templateHeight * newScale

    // Draw blurred background
    ctx.filter = 'blur(2px)'
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    ctx.filter = 'none'

    // Get box position
    const { boxX, boxY } = getBoxPosition()

    // Scale values
    const scaledBoxX = boxX * newScale
    const scaledBoxY = boxY * newScale
    const scaledBoxWidth = formData.boxWidth * newScale
    const scaledBoxHeight = formData.boxHeight * newScale
    const scaledPadding = formData.padding * newScale
    const scaledTitleSize = formData.titleSize * newScale
    const scaledLabelSize = formData.labelSize * newScale
    const scaledValueSize = formData.valueSize * newScale
    const scaledRowGap = formData.rowGap * newScale
    const scaledTopGap = formData.topGap * newScale
    const scaledSectionGap = formData.sectionGap * newScale

    // Draw semi-transparent overlay box
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)'
    ctx.beginPath()
    ctx.roundRect(scaledBoxX, scaledBoxY, scaledBoxWidth, scaledBoxHeight, 12 * newScale)
    ctx.fill()

    // Draw stats content
    const labelColor = 'rgba(255, 255, 255, 0.7)'
    const valueColor = '#ffffff'
    const colWidth = (scaledBoxWidth - scaledPadding * 2) / 3

    // Player name
    ctx.fillStyle = valueColor
    ctx.textAlign = 'center'
    ctx.font = `bold ${scaledTitleSize}px DejaVu Sans, sans-serif`
    ctx.fillText(SAMPLE_STATS.playerName, scaledBoxX + scaledBoxWidth / 2, scaledBoxY + scaledPadding + scaledTitleSize)

    // Divider
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
    ctx.lineWidth = 2 * newScale
    ctx.beginPath()
    const dividerY = scaledBoxY + scaledPadding + scaledTitleSize + 10 * newScale
    ctx.moveTo(scaledBoxX + scaledPadding, dividerY)
    ctx.lineTo(scaledBoxX + scaledBoxWidth - scaledPadding, dividerY)
    ctx.stroke()

    // Column positions
    const col1 = scaledBoxX + scaledPadding + colWidth * 0.5
    const col2 = scaledBoxX + scaledPadding + colWidth * 1.5
    const col3 = scaledBoxX + scaledPadding + colWidth * 2.5

    let y = dividerY + scaledTopGap

    // Row 1: Labels
    ctx.font = `${scaledLabelSize}px DejaVu Sans, sans-serif`
    ctx.fillStyle = labelColor
    ctx.fillText('KILLS', col1, y)
    ctx.fillText('DEATHS', col2, y)
    ctx.fillText('K/D', col3, y)

    // Row 2: Values
    y += scaledRowGap + scaledValueSize
    ctx.font = `bold ${scaledValueSize}px DejaVu Sans, sans-serif`
    ctx.fillStyle = valueColor
    ctx.fillText(SAMPLE_STATS.kills.toString(), col1, y)
    ctx.fillText(SAMPLE_STATS.deaths.toString(), col2, y)
    ctx.fillText(SAMPLE_STATS.kdRatio.toFixed(2), col3, y)

    // Row 3: Labels
    y += scaledRowGap + scaledSectionGap
    ctx.font = `${scaledLabelSize}px DejaVu Sans, sans-serif`
    ctx.fillStyle = labelColor
    ctx.fillText('TEAMKILLS', col1, y)
    ctx.fillText('REVIVES GIVEN', col2, y)
    ctx.fillText('REVIVES RECEIVED', col3, y)

    // Row 4: Values
    y += scaledRowGap + scaledValueSize
    ctx.font = `bold ${scaledValueSize}px DejaVu Sans, sans-serif`
    ctx.fillStyle = valueColor
    ctx.fillText(SAMPLE_STATS.teamkills.toString(), col1, y)
    ctx.fillText(SAMPLE_STATS.revivesGiven.toString(), col2, y)
    ctx.fillText(SAMPLE_STATS.revivesReceived.toString(), col3, y)

    // Row 5: Nemesis label
    y += scaledRowGap + scaledSectionGap
    ctx.font = `${scaledLabelSize}px DejaVu Sans, sans-serif`
    ctx.fillStyle = labelColor
    ctx.fillText('NEMESIS', scaledBoxX + scaledBoxWidth / 2, y)

    // Row 6: Nemesis value
    y += scaledRowGap + scaledValueSize - 4 * newScale
    ctx.font = `bold ${(scaledValueSize - 2 * newScale)}px DejaVu Sans, sans-serif`
    ctx.fillStyle = valueColor
    ctx.fillText(SAMPLE_STATS.nemesis, scaledBoxX + scaledBoxWidth / 2, y)

    // Draw border around box when dragging
    if (isDragging) {
      ctx.strokeStyle = '#5865F2'
      ctx.lineWidth = 2
      ctx.setLineDash([5, 5])
      ctx.strokeRect(scaledBoxX, scaledBoxY, scaledBoxWidth, scaledBoxHeight)
      ctx.setLineDash([])
    }
  }, [formData, getBoxPosition, isDragging])

  // Redraw on form changes
  useEffect(() => {
    if (imageLoaded) {
      drawPreview()
    }
  }, [imageLoaded, drawPreview])

  // Handle window resize
  useEffect(() => {
    const handleResize = () => drawPreview()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [drawPreview])

  // Mouse event handlers for dragging
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canManage) return

    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left) / scale
    const y = (e.clientY - rect.top) / scale

    const { boxX, boxY } = getBoxPosition()

    // Check if click is inside box
    if (x >= boxX && x <= boxX + formData.boxWidth &&
        y >= boxY && y <= boxY + formData.boxHeight) {
      setIsDragging(true)
      setDragStart({ x: x - boxX, y: y - boxY })
    }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) return

    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left) / scale
    const y = (e.clientY - rect.top) / scale

    // Calculate new box position
    let newBoxX = Math.round(x - dragStart.x)
    let newBoxY = Math.round(y - dragStart.y)

    // Clamp to template bounds
    newBoxX = Math.max(0, Math.min(2048 - formData.boxWidth, newBoxX))
    newBoxY = Math.max(0, Math.min(512 - formData.boxHeight, newBoxY))

    setFormData(prev => ({
      ...prev,
      boxX: newBoxX,
      boxY: newBoxY,
    }))
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  // Form handlers
  const handleInputChange = (field: string, value: number | string | boolean | null) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleResetPosition = () => {
    setFormData(prev => ({
      ...prev,
      boxX: null,
      boxY: null,
    }))
  }

  const handleSave = async () => {
    if (!templateId) return

    try {
      await updateMutation.mutateAsync({
        id: templateId,
        request: formData,
      })
    } catch {
      // Error handled by mutation
    }
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }

    // Check image dimensions
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)

    img.onload = () => {
      if (img.width === TARGET_WIDTH && img.height === TARGET_HEIGHT) {
        // Image is correct size, use directly
        URL.revokeObjectURL(objectUrl)
        processImageFile(file)
      } else {
        // Image needs cropping - show the cropper
        setCropperImageSrc(objectUrl)
        setShowCropper(true)
      }
    }
    img.src = objectUrl
  }

  const processImageFile = async (file: File | Blob) => {
    // Convert Blob to File if needed
    const imageFile = file instanceof File ? file : new File([file], 'template.png', { type: 'image/png' })

    if (isNewTemplate) {
      setNewTemplateImage(imageFile)
      // Create preview URL
      const previewUrl = URL.createObjectURL(imageFile)
      if (newImagePreview) {
        URL.revokeObjectURL(newImagePreview)
      }
      setNewImagePreview(previewUrl)
      // Load image for canvas
      const img = new Image()
      img.onload = () => {
        templateImageRef.current = img
        setImageLoaded(true)
      }
      img.src = previewUrl
    } else if (templateId) {
      // Update existing template
      const formData = new FormData()
      formData.append('image', imageFile)

      try {
        await updateImageMutation.mutateAsync({ id: templateId, formData })
        // Reload image
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => {
          templateImageRef.current = img
          drawPreview()
        }
        img.src = statsTemplatesApi.getImageUrl(templateId) + '?t=' + Date.now()
      } catch {
        // Error handled by mutation
      }
    }
  }

  const handleCropComplete = (croppedBlob: Blob) => {
    setShowCropper(false)
    if (cropperImageSrc) {
      URL.revokeObjectURL(cropperImageSrc)
      setCropperImageSrc(null)
    }
    processImageFile(croppedBlob)
  }

  const handleCropCancel = () => {
    setShowCropper(false)
    if (cropperImageSrc) {
      URL.revokeObjectURL(cropperImageSrc)
      setCropperImageSrc(null)
    }
  }

  const handleCreateTemplate = async () => {
    if (!newTemplateName || !newTemplateImage) return

    const templateFormData = new FormData()
    templateFormData.append('name', newTemplateName.toLowerCase().replace(/\s+/g, '-'))
    templateFormData.append('displayName', formData.displayName || newTemplateName)
    templateFormData.append('image', newTemplateImage)
    templateFormData.append('boxWidth', formData.boxWidth.toString())
    templateFormData.append('boxHeight', formData.boxHeight.toString())
    if (formData.boxX !== null) templateFormData.append('boxX', formData.boxX.toString())
    if (formData.boxY !== null) templateFormData.append('boxY', formData.boxY.toString())
    templateFormData.append('rightMargin', formData.rightMargin.toString())
    templateFormData.append('padding', formData.padding.toString())
    templateFormData.append('titleSize', formData.titleSize.toString())
    templateFormData.append('labelSize', formData.labelSize.toString())
    templateFormData.append('valueSize', formData.valueSize.toString())
    templateFormData.append('rowGap', formData.rowGap.toString())
    templateFormData.append('topGap', formData.topGap.toString())
    templateFormData.append('sectionGap', formData.sectionGap.toString())

    try {
      const result = await createMutation.mutateAsync(templateFormData)
      // Navigate to the new template's edit page
      if (result.template?.id) {
        navigate(`/admin/stats-templates/${result.template.id}`)
      } else {
        navigate('/admin/stats-templates')
      }
    } catch {
      // Error handled by mutation
    }
  }

  // Cleanup preview URL on unmount
  useEffect(() => {
    return () => {
      if (newImagePreview) {
        URL.revokeObjectURL(newImagePreview)
      }
    }
  }, [newImagePreview])

  if (isLoading && !isNewTemplate) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-discord-blurple" />
      </div>
    )
  }

  if (!isNewTemplate && !data?.template) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400">Template not found</p>
        <Link to="/admin/stats-templates" className="text-discord-blurple hover:underline mt-2 inline-block">
          Back to templates
        </Link>
      </div>
    )
  }

  const template = data?.template

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            to="/admin/stats-templates"
            className="p-2 text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">
              {isNewTemplate ? 'New Template' : template?.displayName}
            </h1>
            <p className="text-gray-400 text-sm">
              {isNewTemplate ? 'Create a new stats template' : `Template: ${template?.name}`}
            </p>
          </div>
        </div>

        {canManage && (
          <div className="flex items-center gap-3">
            {!isNewTemplate && (
              <button
                onClick={() => refetch()}
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:text-white bg-discord-darker hover:bg-discord-lighter rounded-md transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
            )}
            {isNewTemplate ? (
              <button
                onClick={handleCreateTemplate}
                disabled={createMutation.isPending || !newTemplateName || !newTemplateImage}
                className="flex items-center gap-2 bg-discord-blurple hover:bg-discord-blurple/80 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                {createMutation.isPending ? 'Creating...' : 'Create Template'}
              </button>
            ) : (
              <button
                onClick={handleSave}
                disabled={updateMutation.isPending}
                className="flex items-center gap-2 bg-discord-blurple hover:bg-discord-blurple/80 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Error display */}
      {(createMutation.error || updateMutation.error || updateImageMutation.error) && (
        <div className="bg-red-500/20 border border-red-500/30 rounded-md p-4">
          <p className="text-red-400">
            {((createMutation.error || updateMutation.error || updateImageMutation.error) as Error)?.message || 'An error occurred'}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Preview */}
        <div className="lg:col-span-2 bg-discord-light rounded-lg border border-discord-lighter overflow-hidden">
          <div className="px-4 py-3 border-b border-discord-lighter flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Live Preview</h2>
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Move className="w-4 h-4" />
              Drag box to reposition
            </div>
          </div>
          <div ref={containerRef} className="p-4 bg-discord-darker">
            {isNewTemplate && !imageLoaded ? (
              <div className="aspect-[4/1] flex items-center justify-center border-2 border-dashed border-discord-lighter rounded-lg">
                <div className="text-center text-gray-500">
                  <Upload className="w-8 h-8 mx-auto mb-2" />
                  <p>Upload an image to see preview</p>
                </div>
              </div>
            ) : (
              <canvas
                ref={canvasRef}
                className={`w-full ${canManage ? 'cursor-move' : ''}`}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              />
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="space-y-4">
          {/* Upload Image (for new templates - shown first) */}
          {isNewTemplate && canManage && (
            <div className="bg-discord-light rounded-lg border border-discord-lighter p-4">
              <h3 className="text-white font-medium mb-3">Template Image</h3>
              <p className="text-gray-400 text-sm mb-3">
                Upload an image for the template. Images not matching {TARGET_WIDTH}x{TARGET_HEIGHT} will be cropped automatically.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg"
                onChange={handleImageUpload}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className={`flex items-center gap-2 w-full justify-center px-4 py-3 rounded-md text-sm font-medium transition-colors ${
                  newTemplateImage
                    ? 'bg-green-600/20 border border-green-600/30 text-green-400'
                    : 'bg-discord-darker hover:bg-discord-lighter text-gray-300 hover:text-white border border-discord-lighter'
                }`}
              >
                <Upload className="w-4 h-4" />
                {newTemplateImage ? `Selected: ${newTemplateImage.name}` : 'Choose Image File'}
              </button>
              {!newTemplateImage && (
                <p className="text-yellow-400 text-xs mt-2">Required: Please upload an image</p>
              )}
            </div>
          )}

          {/* Basic Info */}
          <div className="bg-discord-light rounded-lg border border-discord-lighter p-4">
            <h3 className="text-white font-medium mb-3">Basic Info</h3>
            <div className="space-y-3">
              {isNewTemplate && (
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Template Name</label>
                  <input
                    type="text"
                    value={newTemplateName}
                    onChange={(e) => setNewTemplateName(e.target.value)}
                    placeholder="e.g., tank, wide, special"
                    disabled={!canManage}
                    className="w-full bg-discord-darker border border-discord-lighter rounded px-3 py-2 text-white text-sm disabled:opacity-50 placeholder:text-gray-600"
                  />
                  <p className="text-gray-500 text-xs mt-1">
                    Lowercase, no spaces (auto-converted)
                  </p>
                  {!newTemplateName && (
                    <p className="text-yellow-400 text-xs mt-1">Required</p>
                  )}
                </div>
              )}
              <div>
                <label className="block text-sm text-gray-400 mb-1">Display Name</label>
                <input
                  type="text"
                  value={formData.displayName}
                  onChange={(e) => handleInputChange('displayName', e.target.value)}
                  placeholder={isNewTemplate ? 'e.g., Tank Template' : undefined}
                  disabled={!canManage}
                  className="w-full bg-discord-darker border border-discord-lighter rounded px-3 py-2 text-white text-sm disabled:opacity-50 placeholder:text-gray-600"
                />
              </div>
              {!isNewTemplate && !template?.isDefault && (
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={formData.isActive}
                    onChange={(e) => handleInputChange('isActive', e.target.checked)}
                    disabled={!canManage}
                    className="rounded border-discord-lighter bg-discord-darker"
                  />
                  <label htmlFor="isActive" className="text-sm text-gray-300">Active</label>
                </div>
              )}
            </div>
          </div>

          {/* Box Position */}
          <div className="bg-discord-light rounded-lg border border-discord-lighter p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-medium">Box Position</h3>
              {canManage && formData.boxX !== null && (
                <button
                  onClick={handleResetPosition}
                  className="text-xs text-discord-blurple hover:underline"
                >
                  Reset to Auto
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-400 mb-1">X Position</label>
                <input
                  type="number"
                  value={formData.boxX ?? getBoxPosition().boxX}
                  onChange={(e) => handleInputChange('boxX', e.target.value ? parseInt(e.target.value) : null)}
                  disabled={!canManage}
                  className="w-full bg-discord-darker border border-discord-lighter rounded px-3 py-2 text-white text-sm disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Y Position</label>
                <input
                  type="number"
                  value={formData.boxY ?? getBoxPosition().boxY}
                  onChange={(e) => handleInputChange('boxY', e.target.value ? parseInt(e.target.value) : null)}
                  disabled={!canManage}
                  className="w-full bg-discord-darker border border-discord-lighter rounded px-3 py-2 text-white text-sm disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Width</label>
                <input
                  type="number"
                  value={formData.boxWidth}
                  onChange={(e) => handleInputChange('boxWidth', parseInt(e.target.value) || 800)}
                  disabled={!canManage}
                  className="w-full bg-discord-darker border border-discord-lighter rounded px-3 py-2 text-white text-sm disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Height</label>
                <input
                  type="number"
                  value={formData.boxHeight}
                  onChange={(e) => handleInputChange('boxHeight', parseInt(e.target.value) || 420)}
                  disabled={!canManage}
                  className="w-full bg-discord-darker border border-discord-lighter rounded px-3 py-2 text-white text-sm disabled:opacity-50"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm text-gray-400 mb-1">Right Margin (when auto)</label>
                <input
                  type="number"
                  value={formData.rightMargin}
                  onChange={(e) => handleInputChange('rightMargin', parseInt(e.target.value) || 80)}
                  disabled={!canManage}
                  className="w-full bg-discord-darker border border-discord-lighter rounded px-3 py-2 text-white text-sm disabled:opacity-50"
                />
              </div>
            </div>
          </div>

          {/* Text Styling */}
          <div className="bg-discord-light rounded-lg border border-discord-lighter p-4">
            <h3 className="text-white font-medium mb-3">Text Styling</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Padding</label>
                <input
                  type="number"
                  value={formData.padding}
                  onChange={(e) => handleInputChange('padding', parseInt(e.target.value) || 25)}
                  disabled={!canManage}
                  className="w-full bg-discord-darker border border-discord-lighter rounded px-3 py-2 text-white text-sm disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Title Size</label>
                <input
                  type="number"
                  value={formData.titleSize}
                  onChange={(e) => handleInputChange('titleSize', parseInt(e.target.value) || 28)}
                  disabled={!canManage}
                  className="w-full bg-discord-darker border border-discord-lighter rounded px-3 py-2 text-white text-sm disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Label Size</label>
                <input
                  type="number"
                  value={formData.labelSize}
                  onChange={(e) => handleInputChange('labelSize', parseInt(e.target.value) || 18)}
                  disabled={!canManage}
                  className="w-full bg-discord-darker border border-discord-lighter rounded px-3 py-2 text-white text-sm disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Value Size</label>
                <input
                  type="number"
                  value={formData.valueSize}
                  onChange={(e) => handleInputChange('valueSize', parseInt(e.target.value) || 26)}
                  disabled={!canManage}
                  className="w-full bg-discord-darker border border-discord-lighter rounded px-3 py-2 text-white text-sm disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Row Gap</label>
                <input
                  type="number"
                  value={formData.rowGap}
                  onChange={(e) => handleInputChange('rowGap', parseInt(e.target.value) || 12)}
                  disabled={!canManage}
                  className="w-full bg-discord-darker border border-discord-lighter rounded px-3 py-2 text-white text-sm disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Top Gap</label>
                <input
                  type="number"
                  value={formData.topGap}
                  onChange={(e) => handleInputChange('topGap', parseInt(e.target.value) || 40)}
                  disabled={!canManage}
                  className="w-full bg-discord-darker border border-discord-lighter rounded px-3 py-2 text-white text-sm disabled:opacity-50"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm text-gray-400 mb-1">Section Gap</label>
                <input
                  type="number"
                  value={formData.sectionGap}
                  onChange={(e) => handleInputChange('sectionGap', parseInt(e.target.value) || 40)}
                  disabled={!canManage}
                  className="w-full bg-discord-darker border border-discord-lighter rounded px-3 py-2 text-white text-sm disabled:opacity-50"
                />
              </div>
            </div>
          </div>

          {/* Replace Image (only for existing templates) */}
          {canManage && !isNewTemplate && (
            <div className="bg-discord-light rounded-lg border border-discord-lighter p-4">
              <h3 className="text-white font-medium mb-3">Replace Image</h3>
              <p className="text-gray-400 text-sm mb-3">
                Upload a new image. Images not matching {TARGET_WIDTH}x{TARGET_HEIGHT} will be cropped.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg"
                onChange={handleImageUpload}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={updateImageMutation.isPending}
                className="flex items-center gap-2 w-full justify-center bg-discord-darker hover:bg-discord-lighter text-gray-300 hover:text-white px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
              >
                <Upload className="w-4 h-4" />
                {updateImageMutation.isPending ? 'Uploading...' : 'Upload New Image'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Image Cropper Modal */}
      {showCropper && cropperImageSrc && (
        <ImageCropper
          imageSrc={cropperImageSrc}
          onCropComplete={handleCropComplete}
          onCancel={handleCropCancel}
          targetWidth={TARGET_WIDTH}
          targetHeight={TARGET_HEIGHT}
        />
      )}
    </div>
  )
}
