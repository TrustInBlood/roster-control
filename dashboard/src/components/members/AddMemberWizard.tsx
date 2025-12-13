import { useState, useEffect, useCallback, useRef } from 'react'
import { X, Search, Check, AlertCircle, ExternalLink, ChevronLeft, ChevronRight, Loader2, UserPlus } from 'lucide-react'
import { useDiscordMemberSearch, useBattleMetricsLookup, useAddMember } from '../../hooks/useMembers'
import type { DiscordMember, BattleMetricsPlayer, WizardStep, AddMemberResponse } from '../../types/members'

interface AddMemberWizardProps {
  onClose: () => void
}

export default function AddMemberWizard({ onClose }: AddMemberWizardProps) {
  // Wizard state
  const [step, setStep] = useState<WizardStep>(1)
  const [selectedUser, setSelectedUser] = useState<DiscordMember | null>(null)
  const [steamId, setSteamId] = useState('')
  const [bmData, setBmData] = useState<BattleMetricsPlayer | null>(null)
  const [nickname, setNickname] = useState('')
  const [result, setResult] = useState<AddMemberResponse | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Search state for Step 1
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const resultsContainerRef = useRef<HTMLDivElement>(null)

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // API hooks
  const { data: searchResults, isLoading: isSearching } = useDiscordMemberSearch(debouncedSearch, step === 1)
  const { data: bmLookup, isLoading: isBmLoading, isError: bmError } = useBattleMetricsLookup(steamId, step === 2 && steamId.length === 17)
  const addMemberMutation = useAddMember()

  // Reset highlighted index when search results change
  useEffect(() => {
    setHighlightedIndex(-1)
  }, [searchResults])

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && resultsContainerRef.current) {
      const container = resultsContainerRef.current
      const highlightedElement = container.children[0]?.children[highlightedIndex] as HTMLElement
      if (highlightedElement) {
        highlightedElement.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [highlightedIndex])

  // Keyboard navigation for search results
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const members = searchResults?.members || []
    if (members.length === 0) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex(prev =>
          prev < members.length - 1 ? prev + 1 : prev
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex(prev => (prev > 0 ? prev - 1 : -1))
        break
      case 'Enter':
        e.preventDefault()
        if (highlightedIndex >= 0 && highlightedIndex < members.length) {
          handleSelectUser(members[highlightedIndex])
        }
        break
      case 'Escape':
        setSearchQuery('')
        setHighlightedIndex(-1)
        break
    }
  }

  // Update BM data when lookup completes
  useEffect(() => {
    if (bmLookup && !isBmLoading) {
      setBmData(bmLookup)
      // Auto-fill nickname if player found
      if (bmLookup.found && bmLookup.playerData) {
        setNickname(`-B&B- ${bmLookup.playerData.name}`)
      }
    }
  }, [bmLookup, isBmLoading])

  // Validation
  const validateStep = useCallback((currentStep: WizardStep): boolean => {
    const newErrors: Record<string, string> = {}

    switch (currentStep) {
    case 1:
      if (!selectedUser) {
        newErrors.user = 'Please select a Discord user'
      }
      break
    case 2:
      if (!steamId) {
        newErrors.steamId = 'Steam ID is required'
      } else if (!/^7656119\d{10}$/.test(steamId)) {
        newErrors.steamId = 'Invalid Steam64 ID format (should be 17 digits starting with 7656119)'
      }
      break
    case 3:
      if (!nickname) {
        newErrors.nickname = 'Nickname is required'
      } else if (nickname.length > 32) {
        newErrors.nickname = 'Nickname must be 32 characters or less'
      }
      break
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [selectedUser, steamId, nickname])

  // Navigation
  const canGoNext = (): boolean => {
    switch (step) {
    case 1:
      return !!selectedUser
    case 2:
      return /^7656119\d{10}$/.test(steamId) && !isBmLoading
    case 3:
      return nickname.length > 0 && nickname.length <= 32
    default:
      return false
    }
  }

  const handleNext = () => {
    if (!validateStep(step)) return

    if (step === 3) {
      handleSubmit()
    } else {
      setStep((prev) => Math.min(prev + 1, 4) as WizardStep)
    }
  }

  const handleBack = () => {
    setErrors({})
    setStep((prev) => Math.max(prev - 1, 1) as WizardStep)
  }

  const handleSubmit = async () => {
    if (!selectedUser || !steamId || !nickname) return

    try {
      const response = await addMemberMutation.mutateAsync({
        discord_user_id: selectedUser.id,
        steamid64: steamId,
        nickname: nickname,
        battlemetrics_player_id: bmData?.playerData?.id || null,
      })
      setResult(response)
      setStep(4)
    } catch {
      // Error is handled by mutation state
    }
  }

  const handleAddAnother = () => {
    // Reset all state
    setStep(1)
    setSelectedUser(null)
    setSteamId('')
    setBmData(null)
    setNickname('')
    setResult(null)
    setErrors({})
    setSearchQuery('')
    setDebouncedSearch('')
    addMemberMutation.reset()
  }

  const handleSelectUser = (member: DiscordMember) => {
    setSelectedUser(member)
    setSearchQuery('')
    setDebouncedSearch('')
    setHighlightedIndex(-1)
    // Auto-advance to step 2
    setStep(2)
  }

  // Handle Enter key on Steam ID input
  const handleSteamIdKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && canGoNext()) {
      e.preventDefault()
      handleNext()
    }
  }

  // Handle Enter key on nickname input
  const handleNicknameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && canGoNext()) {
      e.preventDefault()
      handleNext()
    }
  }

  // Step indicator
  const StepIndicator = () => (
    <div className="flex items-center justify-center gap-2 mb-6">
      {[1, 2, 3, 4].map((s) => (
        <div key={s} className="flex items-center">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
              s === step
                ? 'bg-discord-blurple text-white'
                : s < step
                  ? 'bg-green-500 text-white'
                  : 'bg-discord-darker text-gray-400'
            }`}
          >
            {s < step ? <Check className="w-4 h-4" /> : s}
          </div>
          {s < 4 && (
            <div
              className={`w-8 h-0.5 ${
                s < step ? 'bg-green-500' : 'bg-discord-darker'
              }`}
            />
          )}
        </div>
      ))}
    </div>
  )

  // Step 1: Select Discord User
  const renderStep1 = () => (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          Search Discord User
        </label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search by username..."
            className="w-full bg-discord-darker border border-discord-lighter rounded-md pl-10 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-discord-blurple"
            autoFocus
          />
        </div>
        {errors.user && (
          <p className="text-red-400 text-xs mt-1">{errors.user}</p>
        )}
      </div>

      {/* Selected User Display */}
      {selectedUser && (
        <div className="bg-discord-darker rounded-md p-3 flex items-center gap-3">
          <img
            src={selectedUser.avatarUrl}
            alt={selectedUser.username}
            className="w-10 h-10 rounded-full"
          />
          <div className="flex-1">
            <p className="text-white font-medium">{selectedUser.displayName}</p>
            <p className="text-gray-400 text-sm">@{selectedUser.username}</p>
          </div>
          <button
            onClick={() => setSelectedUser(null)}
            className="text-gray-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search Results */}
      {searchQuery.length >= 2 && !selectedUser && (
        <div ref={resultsContainerRef} className="bg-discord-darker rounded-md max-h-60 overflow-y-auto">
          {isSearching ? (
            <div className="p-4 text-center text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
              Searching...
            </div>
          ) : searchResults?.members && searchResults.members.length > 0 ? (
            <div className="divide-y divide-discord-lighter">
              {searchResults.members.map((member, index) => (
                <button
                  key={member.id}
                  onClick={() => handleSelectUser(member)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={`w-full p-3 flex items-center gap-3 transition-colors text-left ${
                    index === highlightedIndex
                      ? 'bg-discord-blurple/30'
                      : 'hover:bg-discord-light'
                  }`}
                >
                  <img
                    src={member.avatarUrl}
                    alt={member.username}
                    className="w-8 h-8 rounded-full"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium truncate">{member.displayName}</p>
                    <p className="text-gray-400 text-sm truncate">@{member.username}</p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="p-4 text-center text-gray-400">
              No members found
            </div>
          )}
        </div>
      )}
    </div>
  )

  // Step 2: Enter Steam ID
  const renderStep2 = () => (
    <div className="space-y-4">
      {/* Selected User Reminder */}
      {selectedUser && (
        <div className="bg-discord-darker rounded-md p-3 flex items-center gap-3">
          <img
            src={selectedUser.avatarUrl}
            alt={selectedUser.username}
            className="w-8 h-8 rounded-full"
          />
          <div>
            <p className="text-white font-medium">{selectedUser.displayName}</p>
            <p className="text-gray-400 text-sm">@{selectedUser.username}</p>
          </div>
        </div>
      )}

      {/* Steam ID Input */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          Steam64 ID <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={steamId}
          onChange={(e) => {
            setSteamId(e.target.value.trim())
            setBmData(null)
          }}
          onKeyDown={handleSteamIdKeyDown}
          placeholder="76561198000000000"
          className="w-full bg-discord-darker border border-discord-lighter rounded-md px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-discord-blurple"
          autoFocus
        />
        {errors.steamId && (
          <p className="text-red-400 text-xs mt-1">{errors.steamId}</p>
        )}
      </div>

      {/* BattleMetrics Lookup Result */}
      {steamId.length === 17 && /^7656119\d{10}$/.test(steamId) && (
        <div className="bg-discord-darker rounded-md p-4">
          <h4 className="text-sm font-medium text-gray-300 mb-2">BattleMetrics Lookup</h4>
          {isBmLoading ? (
            <div className="flex items-center gap-2 text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              Looking up player...
            </div>
          ) : bmError ? (
            <div className="flex items-center gap-2 text-red-400">
              <AlertCircle className="w-4 h-4" />
              Failed to lookup player
            </div>
          ) : bmData?.found && bmData.playerData ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-green-400">
                <Check className="w-4 h-4" />
                Player found
              </div>
              <div className="pl-6 space-y-1">
                <p className="text-white">
                  <span className="text-gray-400">Name:</span> {bmData.playerData.name}
                </p>
                {bmData.profileUrl && (
                  <a
                    href={bmData.profileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-discord-blurple hover:underline flex items-center gap-1 text-sm"
                  >
                    View BattleMetrics Profile
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          ) : bmData && !bmData.found ? (
            <div className="flex items-center gap-2 text-yellow-400">
              <AlertCircle className="w-4 h-4" />
              Player not found in BattleMetrics
              <span className="text-gray-400 text-xs">(You can still proceed)</span>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )

  // Step 3: Review & Nickname
  const renderStep3 = () => (
    <div className="space-y-4">
      {/* Summary */}
      <div className="bg-discord-darker rounded-md p-4 space-y-3">
        <h4 className="text-sm font-medium text-gray-300">Review Details</h4>

        {/* User */}
        <div className="flex items-center gap-3">
          {selectedUser && (
            <>
              <img
                src={selectedUser.avatarUrl}
                alt={selectedUser.username}
                className="w-10 h-10 rounded-full"
              />
              <div>
                <p className="text-white font-medium">{selectedUser.displayName}</p>
                <p className="text-gray-400 text-sm">@{selectedUser.username}</p>
              </div>
            </>
          )}
        </div>

        <div className="border-t border-discord-lighter pt-3 space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-400">Steam ID:</span>
            <span className="text-white font-mono text-sm">{steamId}</span>
          </div>
          {bmData?.found && bmData.playerData && (
            <div className="flex justify-between">
              <span className="text-gray-400">BM Player Name:</span>
              <span className="text-white">{bmData.playerData.name}</span>
            </div>
          )}
        </div>
      </div>

      {/* Nickname Input */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          Server Nickname <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          onKeyDown={handleNicknameKeyDown}
          placeholder="-B&B- PlayerName"
          maxLength={32}
          className="w-full bg-discord-darker border border-discord-lighter rounded-md px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-discord-blurple"
          autoFocus
        />
        <p className="text-gray-500 text-xs mt-1">{nickname.length}/32 characters</p>
        {errors.nickname && (
          <p className="text-red-400 text-xs mt-1">{errors.nickname}</p>
        )}
      </div>

      {/* What will happen */}
      <div className="bg-discord-darker rounded-md p-4">
        <h4 className="text-sm font-medium text-gray-300 mb-2">What will happen:</h4>
        <ul className="text-sm text-gray-400 space-y-1 list-disc list-inside">
          <li>Create Steam-Discord account link (confidence 1.0)</li>
          <li>Assign Member role</li>
          <li>Set server nickname to "{nickname || '...'}"</li>
          {bmData?.found && <li>Add "Member" flag in BattleMetrics</li>}
          <li>Send welcome message in member chat</li>
        </ul>
      </div>
    </div>
  )

  // Step 4: Success
  const renderStep4 = () => (
    <div className="space-y-4">
      {result?.success ? (
        <>
          <div className="text-center">
            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-green-500" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">Member Added Successfully!</h3>
            <p className="text-gray-400">
              {result.member.username} has been added as a member.
            </p>
          </div>

          {/* Results */}
          <div className="bg-discord-darker rounded-md p-4 space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-400">Account Link:</span>
              <span className="text-green-400">
                {result.results.linkCreated ? 'Created' :
                  result.results.linkUpdated ? 'Updated' : 'Already exists'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Member Role:</span>
              <span className={result.results.roleAdded || result.results.alreadyHadRole ? 'text-green-400' : 'text-red-400'}>
                {result.results.roleAdded ? 'Added' :
                  result.results.alreadyHadRole ? 'Already had' : 'Failed'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Nickname:</span>
              <span className={result.results.nicknameSet ? 'text-green-400' : 'text-red-400'}>
                {result.results.nicknameSet ? 'Set' : 'Failed'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">BM Flag:</span>
              <span className={
                result.results.flagAdded === 'added' ? 'text-green-400' :
                  result.results.flagAdded === 'already_has' ? 'text-green-400' :
                    result.results.flagAdded === 'skipped' ? 'text-gray-400' :
                      'text-red-400'
              }>
                {result.results.flagAdded === 'added' ? 'Added' :
                  result.results.flagAdded === 'already_has' ? 'Already has' :
                    result.results.flagAdded === 'skipped' ? 'Skipped' :
                      'Failed'}
              </span>
            </div>
          </div>

          {/* Warnings */}
          {result.errors.length > 0 && (
            <div className="bg-yellow-500/20 border border-yellow-500/30 rounded-md p-3">
              <h4 className="text-sm font-medium text-yellow-400 mb-1">Warnings:</h4>
              <ul className="text-sm text-yellow-300 list-disc list-inside">
                {result.errors.map((error, i) => (
                  <li key={i}>{error}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <div className="text-center">
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">Failed to Add Member</h3>
          <p className="text-gray-400">
            {result?.errors?.[0] || 'An unexpected error occurred'}
          </p>
        </div>
      )}
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-discord-light rounded-lg w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-discord-lighter">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-discord-blurple" />
            <h2 className="text-lg font-semibold text-white">Add Member</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          <StepIndicator />

          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
          {step === 4 && renderStep4()}

          {/* Mutation Error */}
          {addMemberMutation.error && step !== 4 && (
            <div className="bg-red-500/20 border border-red-500/30 rounded-md p-3 mt-4">
              <p className="text-sm text-red-400">
                {(addMemberMutation.error as Error).message || 'Failed to add member'}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between gap-3 p-4 border-t border-discord-lighter">
          {step < 4 ? (
            <>
              <button
                type="button"
                onClick={step === 1 ? onClose : handleBack}
                className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                {step === 1 ? 'Cancel' : 'Back'}
              </button>
              <button
                type="button"
                onClick={handleNext}
                disabled={!canGoNext() || addMemberMutation.isPending}
                className="flex items-center gap-1 bg-discord-blurple hover:bg-discord-blurple/80 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {addMemberMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Adding...
                  </>
                ) : step === 3 ? (
                  <>
                    Add Member
                    <Check className="w-4 h-4" />
                  </>
                ) : (
                  <>
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleAddAnother}
                className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
              >
                <UserPlus className="w-4 h-4" />
                Add Another
              </button>
              <button
                type="button"
                onClick={onClose}
                className="bg-discord-blurple hover:bg-discord-blurple/80 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
              >
                Close
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
