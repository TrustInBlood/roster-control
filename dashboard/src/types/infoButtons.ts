/**
 * Embed field structure for Discord embeds
 */
export interface EmbedField {
  name: string
  value: string
  inline: boolean
}

/**
 * Embed footer structure
 */
export interface EmbedFooter {
  text: string
}

/**
 * Discord embed structure for info buttons
 */
export interface InfoButtonEmbed {
  color: number
  title: string
  description: string
  fields?: EmbedField[]
  footer?: EmbedFooter
}

/**
 * Info button configuration stored in database
 */
export interface InfoPostButton {
  id: number
  button_id: string
  button_label: string
  button_emoji: string | null
  channels: Record<string, string> | null
  embed: InfoButtonEmbed
  display_order: number
  enabled: boolean
  created_at: string
  updated_at: string
}

/**
 * Request body for creating a new info button
 */
export interface CreateInfoButtonRequest {
  button_id: string
  button_label: string
  button_emoji?: string | null
  channels?: Record<string, string> | null
  embed: InfoButtonEmbed
  enabled?: boolean
}

/**
 * Request body for updating an info button
 */
export interface UpdateInfoButtonRequest {
  button_label?: string
  button_emoji?: string | null
  channels?: Record<string, string> | null
  embed?: InfoButtonEmbed
  enabled?: boolean
}

/**
 * Request body for reordering buttons
 */
export interface ReorderRequest {
  order: Array<{ id: number; display_order: number }>
}

/**
 * API response for list of info buttons
 */
export interface InfoButtonsListResponse {
  success: boolean
  buttons: InfoPostButton[]
}

/**
 * API response for single info button
 */
export interface InfoButtonResponse {
  success: boolean
  button: InfoPostButton
}

/**
 * API response for mutations
 */
export interface InfoButtonMutationResponse {
  success: boolean
  message?: string
  button?: InfoPostButton
}
