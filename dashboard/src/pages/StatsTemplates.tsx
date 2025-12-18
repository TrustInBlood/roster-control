import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Image, Plus, RefreshCw, Star, Settings, Trash2, Upload, Eye, EyeOff } from 'lucide-react'
import {
  useStatsTemplates,
  useDeleteTemplate,
  useSetDefaultTemplate,
  useRefreshTemplateCache,
  useSeedTemplates,
  useRoleMappings,
  useDeleteRoleMapping,
  useUpdateTemplate,
  useCreateRoleMapping,
} from '../hooks/useStatsTemplates'
import { useAuth } from '../hooks/useAuth'
import { statsTemplatesApi, permissionsApi } from '../lib/api'
import type { StatsTemplate, RoleMapping } from '../types/statsTemplates'
import type { DiscordRole } from '../types/permissions'

export default function StatsTemplates() {
  const { hasPermission } = useAuth()
  const canManage = hasPermission('MANAGE_STATS_TEMPLATES')

  const { data: templatesData, isLoading: templatesLoading, refetch, isRefetching } = useStatsTemplates()
  const { data: mappingsData, isLoading: mappingsLoading } = useRoleMappings()

  const deleteMutation = useDeleteTemplate()
  const setDefaultMutation = useSetDefaultTemplate()
  const refreshCacheMutation = useRefreshTemplateCache()
  const seedMutation = useSeedTemplates()
  const deleteRoleMappingMutation = useDeleteRoleMapping()
  const updateMutation = useUpdateTemplate()
  const createRoleMappingMutation = useCreateRoleMapping()

  const [deleteConfirm, setDeleteConfirm] = useState<StatsTemplate | null>(null)
  const [mappingDeleteConfirm, setMappingDeleteConfirm] = useState<RoleMapping | null>(null)
  const [showAddMapping, setShowAddMapping] = useState(false)
  const [discordRoles, setDiscordRoles] = useState<DiscordRole[]>([])
  const [newMappingRoleId, setNewMappingRoleId] = useState('')
  const [newMappingTemplateId, setNewMappingTemplateId] = useState('')
  const [newMappingPriority, setNewMappingPriority] = useState(0)

  // Fetch Discord roles when modal opens
  useEffect(() => {
    if (showAddMapping && discordRoles.length === 0) {
      permissionsApi.getRoles().then(res => {
        if (res.roles) {
          setDiscordRoles(res.roles.sort((a, b) => b.position - a.position))
        }
      }).catch(console.error)
    }
  }, [showAddMapping, discordRoles.length])

  const handleSetDefault = async (template: StatsTemplate) => {
    if (template.isDefault) return
    try {
      await setDefaultMutation.mutateAsync(template.id)
    } catch {
      // Error handled by mutation
    }
  }

  const handleToggleActive = async (template: StatsTemplate) => {
    try {
      await updateMutation.mutateAsync({
        id: template.id,
        request: { isActive: !template.isActive },
      })
    } catch {
      // Error handled by mutation
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirm) return
    try {
      await deleteMutation.mutateAsync(deleteConfirm.id)
      setDeleteConfirm(null)
    } catch {
      // Error handled by mutation
    }
  }

  const handleDeleteRoleMapping = async () => {
    if (!mappingDeleteConfirm) return
    try {
      await deleteRoleMappingMutation.mutateAsync(mappingDeleteConfirm.roleId)
      setMappingDeleteConfirm(null)
    } catch {
      // Error handled by mutation
    }
  }

  const handleCreateRoleMapping = async () => {
    if (!newMappingRoleId || !newMappingTemplateId) return
    try {
      await createRoleMappingMutation.mutateAsync({
        roleId: newMappingRoleId,
        templateId: parseInt(newMappingTemplateId, 10),
        priority: newMappingPriority,
      })
      setShowAddMapping(false)
      setNewMappingRoleId('')
      setNewMappingTemplateId('')
      setNewMappingPriority(0)
    } catch {
      // Error handled by mutation
    }
  }

  const templates = templatesData?.templates || []
  const mappings = mappingsData?.mappings || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Image className="w-8 h-8 text-discord-blurple" />
          <div>
            <h1 className="text-2xl font-bold text-white">Stats Templates</h1>
            <p className="text-gray-400 text-sm">
              Manage stats image templates and role assignments
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:text-white bg-discord-darker hover:bg-discord-lighter rounded-md transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isRefetching ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {canManage && (
            <>
              <button
                onClick={() => refreshCacheMutation.mutate()}
                disabled={refreshCacheMutation.isPending}
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:text-green-400 bg-discord-darker hover:bg-discord-lighter rounded-md transition-colors disabled:opacity-50"
                title="Clear template cache on bot"
              >
                <RefreshCw className={`w-4 h-4 ${refreshCacheMutation.isPending ? 'animate-spin' : ''}`} />
                Clear Cache
              </button>
              <button
                onClick={() => seedMutation.mutate()}
                disabled={seedMutation.isPending}
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:text-orange-400 bg-discord-darker hover:bg-discord-lighter rounded-md transition-colors disabled:opacity-50"
                title="Import templates from config file"
              >
                <Upload className={`w-4 h-4 ${seedMutation.isPending ? 'animate-pulse' : ''}`} />
                Seed
              </button>
              <Link
                to="/admin/stats-templates/new"
                className="flex items-center gap-2 bg-discord-blurple hover:bg-discord-blurple/80 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
              >
                <Plus className="w-4 h-4" />
                New Template
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Info Card */}
      <div className="bg-discord-light rounded-lg p-4 border border-discord-lighter">
        <div className="flex items-start gap-3">
          <div className="bg-discord-blurple/20 p-2 rounded-lg">
            <Image className="w-5 h-5 text-discord-blurple" />
          </div>
          <div>
            <h3 className="text-white font-medium mb-1">How Stats Templates Work</h3>
            <p className="text-gray-400 text-sm">
              Stats templates are background images used for player stats cards. Each template can have
              a customizable overlay box position. You can assign specific templates to Discord roles, or
              leave them unassigned to be used randomly.
            </p>
          </div>
        </div>
      </div>

      {/* Templates Grid */}
      <div className="bg-discord-light rounded-lg border border-discord-lighter overflow-hidden">
        <div className="px-4 py-3 border-b border-discord-lighter">
          <h2 className="text-lg font-semibold text-white">Templates</h2>
        </div>

        {templatesLoading ? (
          <div className="p-8 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-discord-blurple" />
          </div>
        ) : templates.length === 0 ? (
          <div className="p-8 text-center">
            <Image className="w-12 h-12 mx-auto text-gray-600 mb-3" />
            <p className="text-gray-400">No templates found</p>
            <p className="text-gray-500 text-sm mt-1">
              Click "Seed" to import templates from config, or create a new one.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
            {templates.map((template) => (
              <div
                key={template.id}
                className="bg-discord-darker rounded-lg overflow-hidden border border-discord-lighter hover:border-discord-blurple/50 transition-colors"
              >
                {/* Template Preview */}
                <div className="relative aspect-[4/1] bg-black">
                  <img
                    src={statsTemplatesApi.getImageUrl(template.id)}
                    alt={template.displayName}
                    className="w-full h-full object-cover"
                  />
                  {template.isDefault && (
                    <div className="absolute top-2 left-2 bg-yellow-500/90 text-black px-2 py-0.5 rounded text-xs font-medium flex items-center gap-1">
                      <Star className="w-3 h-3" />
                      Default
                    </div>
                  )}
                  {!template.isActive && (
                    <div className="absolute top-2 right-2 bg-red-500/90 text-white px-2 py-0.5 rounded text-xs font-medium">
                      Inactive
                    </div>
                  )}
                </div>

                {/* Template Info */}
                <div className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h3 className="text-white font-medium">{template.displayName}</h3>
                      <p className="text-gray-500 text-xs">{template.name}</p>
                    </div>
                    {canManage && (
                      <div className="flex items-center gap-1">
                        {!template.isDefault && (
                          <button
                            onClick={() => handleToggleActive(template)}
                            disabled={updateMutation.isPending}
                            className={`p-1.5 transition-colors ${
                              template.isActive
                                ? 'text-green-400 hover:text-green-300'
                                : 'text-gray-500 hover:text-gray-300'
                            }`}
                            title={template.isActive ? 'Disable template' : 'Enable template'}
                          >
                            {template.isActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                          </button>
                        )}
                        {!template.isDefault && (
                          <button
                            onClick={() => handleSetDefault(template)}
                            disabled={setDefaultMutation.isPending}
                            className="p-1.5 text-gray-400 hover:text-yellow-400 transition-colors"
                            title="Set as default"
                          >
                            <Star className="w-4 h-4" />
                          </button>
                        )}
                        <Link
                          to={`/admin/stats-templates/${template.id}`}
                          className="p-1.5 text-gray-400 hover:text-white transition-colors"
                          title="Edit template"
                        >
                          <Settings className="w-4 h-4" />
                        </Link>
                        {!template.isDefault && (
                          <button
                            onClick={() => setDeleteConfirm(template)}
                            className="p-1.5 text-gray-400 hover:text-red-400 transition-colors"
                            title="Delete template"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Box Position Info */}
                  <div className="text-xs text-gray-500">
                    Box: {template.boxWidth}x{template.boxHeight}
                    {template.boxX !== null ? ` @ (${template.boxX}, ${template.boxY})` : ' (auto)'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Role Mappings */}
      <div className="bg-discord-light rounded-lg border border-discord-lighter overflow-hidden">
        <div className="px-4 py-3 border-b border-discord-lighter flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Role Mappings</h2>
          {canManage && templates.length > 0 && (
            <button
              onClick={() => setShowAddMapping(true)}
              className="flex items-center gap-1 text-sm text-discord-blurple hover:text-discord-blurple/80 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Mapping
            </button>
          )}
        </div>

        {mappingsLoading ? (
          <div className="p-8 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-discord-blurple" />
          </div>
        ) : mappings.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-gray-400">No role mappings configured</p>
            <p className="text-gray-500 text-sm mt-1">
              Without mappings, templates are selected randomly for all users.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-400 border-b border-discord-lighter">
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Template</th>
                  <th className="px-4 py-3 font-medium">Priority</th>
                  {canManage && <th className="px-4 py-3 font-medium w-20">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-discord-lighter">
                {mappings.map((mapping) => (
                  <tr key={mapping.id} className="hover:bg-discord-darker/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: mapping.roleColor || '#99AAB5' }}
                        />
                        <span className="text-white">{mapping.roleName || mapping.roleId}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-300">
                      {mapping.templateDisplayName || mapping.templateName || 'Unknown'}
                    </td>
                    <td className="px-4 py-3 text-gray-400">{mapping.priority}</td>
                    {canManage && (
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setMappingDeleteConfirm(mapping)}
                          className="p-1.5 text-gray-400 hover:text-red-400 transition-colors"
                          title="Remove mapping"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete Template Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-discord-light rounded-lg w-full max-w-md mx-4 p-6">
            <h3 className="text-lg font-semibold text-white mb-2">
              Delete Template?
            </h3>
            <p className="text-gray-400 mb-4">
              Are you sure you want to delete <span className="text-white font-medium">{deleteConfirm.displayName}</span>?
              This will also remove any role mappings for this template.
            </p>

            {deleteMutation.error && (
              <div className="bg-red-500/20 border border-red-500/30 rounded-md p-3 mb-4">
                <p className="text-sm text-red-400">
                  {(deleteMutation.error as Error).message || 'Failed to delete template'}
                </p>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete Template'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Role Mapping Confirmation Modal */}
      {mappingDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-discord-light rounded-lg w-full max-w-md mx-4 p-6">
            <h3 className="text-lg font-semibold text-white mb-2">
              Remove Role Mapping?
            </h3>
            <p className="text-gray-400 mb-4">
              Remove the template mapping for <span className="text-white font-medium">{mappingDeleteConfirm.roleName || mappingDeleteConfirm.roleId}</span>?
              Users with this role will get random templates instead.
            </p>

            {deleteRoleMappingMutation.error && (
              <div className="bg-red-500/20 border border-red-500/30 rounded-md p-3 mb-4">
                <p className="text-sm text-red-400">
                  {(deleteRoleMappingMutation.error as Error).message || 'Failed to remove mapping'}
                </p>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setMappingDeleteConfirm(null)}
                className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteRoleMapping}
                disabled={deleteRoleMappingMutation.isPending}
                className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
              >
                {deleteRoleMappingMutation.isPending ? 'Removing...' : 'Remove Mapping'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Role Mapping Modal */}
      {showAddMapping && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-discord-light rounded-lg w-full max-w-md mx-4 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">
              Add Role Mapping
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Discord Role</label>
                <select
                  value={newMappingRoleId}
                  onChange={(e) => setNewMappingRoleId(e.target.value)}
                  className="w-full bg-discord-darker border border-discord-lighter rounded px-3 py-2 text-white text-sm"
                >
                  <option value="">Select a role...</option>
                  {discordRoles
                    .filter(role => !mappings.some(m => m.roleId === role.id))
                    .map(role => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Template</label>
                <select
                  value={newMappingTemplateId}
                  onChange={(e) => setNewMappingTemplateId(e.target.value)}
                  className="w-full bg-discord-darker border border-discord-lighter rounded px-3 py-2 text-white text-sm"
                >
                  <option value="">Select a template...</option>
                  {templates
                    .filter(t => t.isActive)
                    .map(template => (
                      <option key={template.id} value={template.id}>
                        {template.displayName}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Priority</label>
                <input
                  type="number"
                  value={newMappingPriority}
                  onChange={(e) => setNewMappingPriority(parseInt(e.target.value) || 0)}
                  className="w-full bg-discord-darker border border-discord-lighter rounded px-3 py-2 text-white text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">Higher priority = checked first when user has multiple roles</p>
              </div>
            </div>

            {createRoleMappingMutation.error && (
              <div className="bg-red-500/20 border border-red-500/30 rounded-md p-3 mt-4">
                <p className="text-sm text-red-400">
                  {(createRoleMappingMutation.error as Error).message || 'Failed to create mapping'}
                </p>
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowAddMapping(false)
                  setNewMappingRoleId('')
                  setNewMappingTemplateId('')
                  setNewMappingPriority(0)
                }}
                className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateRoleMapping}
                disabled={createRoleMappingMutation.isPending || !newMappingRoleId || !newMappingTemplateId}
                className="bg-discord-blurple hover:bg-discord-blurple/80 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
              >
                {createRoleMappingMutation.isPending ? 'Adding...' : 'Add Mapping'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
