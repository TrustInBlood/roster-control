import { useState } from 'react'
import {
  RefreshCw,
  MessageSquare,
  Plus,
  Edit2,
  Trash2,
  ToggleLeft,
  ToggleRight,
  GripVertical,
  Upload,
  RefreshCcw,
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import {
  useInfoButtons,
  useDeleteInfoButton,
  useUpdateInfoButton,
  useReorderInfoButtons,
  useReloadInfoPost,
} from '../hooks/useInfoButtons'
import { useAuth } from '../hooks/useAuth'
import InfoButtonEditModal from '../components/infobuttons/InfoButtonEditModal'
import type { InfoPostButton } from '../types/infoButtons'

export default function InfoButtons() {
  const queryClient = useQueryClient()
  const { hasPermission } = useAuth()
  const canEdit = hasPermission('MANAGE_INFO_BUTTONS')

  const { data, isLoading, isRefetching, error } = useInfoButtons()
  const deleteMutation = useDeleteInfoButton()
  const updateMutation = useUpdateInfoButton()
  const reorderMutation = useReorderInfoButtons()
  const reloadMutation = useReloadInfoPost()

  const [editingButton, setEditingButton] = useState<InfoPostButton | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['info-buttons'] })
  }

  const handleToggleEnabled = async (button: InfoPostButton) => {
    try {
      await updateMutation.mutateAsync({
        id: button.id,
        request: { enabled: !button.enabled },
      })
    } catch {
      // Error handled by mutation state
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await deleteMutation.mutateAsync(id)
      setDeleteConfirmId(null)
    } catch {
      // Error handled by mutation state
    }
  }

  const handleReloadPost = async (recreate = false) => {
    try {
      await reloadMutation.mutateAsync(recreate)
    } catch {
      // Error handled by mutation state
    }
  }

  // Drag and drop handlers
  const handleDragStart = (index: number) => {
    setDraggedIndex(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === index) return
  }

  const handleDrop = async (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === dropIndex || !data?.buttons) return

    const buttons = [...data.buttons]
    const [draggedButton] = buttons.splice(draggedIndex, 1)
    buttons.splice(dropIndex, 0, draggedButton)

    // Build new order array
    const order = buttons.map((btn, index) => ({
      id: btn.id,
      display_order: index + 1,
    }))

    setDraggedIndex(null)

    try {
      await reorderMutation.mutateAsync(order)
    } catch {
      // Error handled by mutation state
    }
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
  }

  const buttons = data?.buttons || []

  if (error) {
    return (
      <div className="space-y-6">
        <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-red-400 mb-2">Error Loading Info Buttons</h2>
          <p className="text-gray-400">
            {(error as Error).message || 'Failed to load info buttons. Please try again.'}
          </p>
          <button
            onClick={handleRefresh}
            className="mt-4 bg-discord-blurple hover:bg-discord-blurple/80 text-white px-4 py-2 rounded-md text-sm font-medium"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <MessageSquare className="w-7 h-7 text-discord-blurple" />
            Info Buttons
          </h1>
          <p className="text-gray-400 mt-1">
            Manage the info buttons on the whitelist post
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => handleReloadPost(false)}
            disabled={reloadMutation.isPending}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
            title="Update the whitelist post in Discord with current buttons"
          >
            <Upload className={`w-4 h-4 ${reloadMutation.isPending ? 'animate-pulse' : ''}`} />
            {reloadMutation.isPending ? 'Updating...' : 'Update Post'}
          </button>
          <button
            onClick={() => handleReloadPost(true)}
            disabled={reloadMutation.isPending}
            className="flex items-center gap-2 bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
            title="Delete and recreate the whitelist post (use if post is missing or broken)"
          >
            <RefreshCcw className={`w-4 h-4 ${reloadMutation.isPending ? 'animate-spin' : ''}`} />
            Recreate
          </button>
          <button
            onClick={handleRefresh}
            disabled={isRefetching}
            className="flex items-center gap-2 bg-discord-lighter hover:bg-discord-light text-gray-300 px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isRefetching ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {canEdit && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 bg-discord-blurple hover:bg-discord-blurple/80 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Button
            </button>
          )}
        </div>
      </div>

      {/* Success/Error Messages */}
      {reloadMutation.isSuccess && (
        <div className="bg-green-500/20 border border-green-500/30 rounded-lg p-4">
          <p className="text-sm text-green-400">Whitelist post updated successfully!</p>
        </div>
      )}

      {reloadMutation.error && (
        <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-4">
          <p className="text-sm text-red-400">
            {(reloadMutation.error as Error).message || 'Failed to update post'}
          </p>
        </div>
      )}

      {/* Buttons List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-discord-blurple"></div>
        </div>
      ) : buttons.length === 0 ? (
        <div className="bg-discord-light rounded-lg p-8 text-center">
          <MessageSquare className="w-12 h-12 text-gray-500 mx-auto mb-3" />
          <p className="text-gray-400">No info buttons configured yet.</p>
          {canEdit && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-4 bg-discord-blurple hover:bg-discord-blurple/80 text-white px-4 py-2 rounded-md text-sm font-medium"
            >
              Create First Button
            </button>
          )}
        </div>
      ) : (
        <div className="bg-discord-light rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-discord-lighter">
                  <th className="text-left p-4 text-gray-400 font-medium w-8"></th>
                  <th className="text-left p-4 text-gray-400 font-medium">Button</th>
                  <th className="text-left p-4 text-gray-400 font-medium">ID</th>
                  <th className="text-left p-4 text-gray-400 font-medium">Embed Title</th>
                  <th className="text-center p-4 text-gray-400 font-medium">Status</th>
                  <th className="text-right p-4 text-gray-400 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {buttons.map((button, index) => (
                  <tr
                    key={button.id}
                    draggable={canEdit}
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDrop={(e) => handleDrop(e, index)}
                    onDragEnd={handleDragEnd}
                    className={`border-b border-discord-lighter last:border-0 hover:bg-discord-lighter/50 transition-colors ${
                      draggedIndex === index ? 'opacity-50' : ''
                    }`}
                  >
                    <td className="p-4">
                      {canEdit && (
                        <GripVertical className="w-4 h-4 text-gray-500 cursor-grab" />
                      )}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        {button.button_emoji && (
                          <span className="text-lg">{button.button_emoji}</span>
                        )}
                        <span className="text-white font-medium">{button.button_label}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <code className="text-sm text-gray-400 bg-discord-darker px-2 py-1 rounded">
                        {button.button_id}
                      </code>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{
                            backgroundColor: `#${button.embed.color.toString(16).padStart(6, '0')}`,
                          }}
                        />
                        <span className="text-gray-300">{button.embed.title}</span>
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      <button
                        onClick={() => handleToggleEnabled(button)}
                        disabled={!canEdit || updateMutation.isPending}
                        className={`p-1 rounded transition-colors ${
                          button.enabled
                            ? 'text-green-400 hover:text-green-300'
                            : 'text-gray-500 hover:text-gray-400'
                        } disabled:opacity-50`}
                        title={button.enabled ? 'Enabled' : 'Disabled'}
                      >
                        {button.enabled ? (
                          <ToggleRight className="w-6 h-6" />
                        ) : (
                          <ToggleLeft className="w-6 h-6" />
                        )}
                      </button>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-end gap-2">
                        {canEdit && (
                          <>
                            <button
                              onClick={() => setEditingButton(button)}
                              className="p-2 text-gray-400 hover:text-discord-blurple transition-colors"
                              title="Edit"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setDeleteConfirmId(button.id)}
                              className="p-2 text-gray-400 hover:text-red-400 transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Hint */}
      {canEdit && buttons.length > 1 && (
        <p className="text-sm text-gray-500 text-center">
          Drag and drop rows to reorder buttons
        </p>
      )}

      {/* Edit Modal */}
      {(editingButton || showCreateModal) && (
        <InfoButtonEditModal
          button={editingButton}
          onClose={() => {
            setEditingButton(null)
            setShowCreateModal(false)
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-discord-light rounded-lg w-full max-w-md mx-4 p-6">
            <h3 className="text-lg font-semibold text-white mb-2">Delete Info Button?</h3>
            <p className="text-gray-400 text-sm mb-4">
              Are you sure you want to delete this info button? This action cannot be undone.
            </p>

            {deleteMutation.error && (
              <div className="bg-red-500/20 border border-red-500/30 rounded-md p-3 mb-4">
                <p className="text-sm text-red-400">
                  {(deleteMutation.error as Error).message || 'Failed to delete button'}
                </p>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirmId)}
                disabled={deleteMutation.isPending}
                className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
