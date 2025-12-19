import { useState } from 'react'
import { X, Server, Target, Award, ChevronRight, ChevronLeft, AlertTriangle, FlaskConical } from 'lucide-react'
import { useServers, useCreateSession } from '../../hooks/useSeeding'
import type { RewardUnit, RewardsConfig, CreateSessionRequest } from '../../types/seeding'

interface CreateSessionModalProps {
  onClose: () => void
  onSuccess: () => void
}

type Step = 'target' | 'threshold' | 'rewards' | 'confirm'

export default function CreateSessionModal({ onClose, onSuccess }: CreateSessionModalProps) {
  const [step, setStep] = useState<Step>('target')
  const [targetServerId, setTargetServerId] = useState<string>('')
  const [playerThreshold, setPlayerThreshold] = useState<number>(50)
  const [testMode, setTestMode] = useState<boolean>(false)
  const [selectedSourceServerIds, setSelectedSourceServerIds] = useState<string[]>([])
  const [rewards, setRewards] = useState<RewardsConfig>({
    switch: { value: 6, unit: 'hours' },
    playtime: { value: 12, unit: 'hours', thresholdMinutes: 30 },
    completion: { value: 6, unit: 'hours' },
  })

  const { data: servers, isLoading: loadingServers } = useServers()
  const createSession = useCreateSession()

  const selectedServer = servers?.find((s) => s.id === targetServerId)
  const availableSourceServers = servers?.filter((s) => s.id !== targetServerId) || []
  const sourceServers = testMode
    ? availableSourceServers.filter((s) => selectedSourceServerIds.includes(s.id))
    : availableSourceServers

  const toggleSourceServer = (serverId: string) => {
    setSelectedSourceServerIds((prev) =>
      prev.includes(serverId)
        ? prev.filter((id) => id !== serverId)
        : [...prev, serverId]
    )
  }

  const totalRewardHours = (() => {
    let total = 0
    if (rewards.switch) {
      total += rewards.switch.unit === 'hours' ? rewards.switch.value :
               rewards.switch.unit === 'days' ? rewards.switch.value * 24 :
               rewards.switch.value * 24 * 30
    }
    if (rewards.playtime) {
      total += rewards.playtime.unit === 'hours' ? rewards.playtime.value :
               rewards.playtime.unit === 'days' ? rewards.playtime.value * 24 :
               rewards.playtime.value * 24 * 30
    }
    if (rewards.completion) {
      total += rewards.completion.unit === 'hours' ? rewards.completion.value :
               rewards.completion.unit === 'days' ? rewards.completion.value * 24 :
               rewards.completion.value * 24 * 30
    }
    return total
  })()

  const canProceed = () => {
    switch (step) {
      case 'target':
        // In test mode, must also select at least one source server
        if (testMode) {
          return !!targetServerId && selectedSourceServerIds.length > 0
        }
        return !!targetServerId
      case 'threshold':
        // Test mode allows threshold as low as 1, normal mode requires 10+
        return testMode ? playerThreshold >= 1 : playerThreshold >= 10
      case 'rewards':
        return rewards.switch || rewards.playtime || rewards.completion
      case 'confirm':
        return true
    }
  }

  const nextStep = () => {
    const steps: Step[] = ['target', 'threshold', 'rewards', 'confirm']
    const currentIndex = steps.indexOf(step)
    if (currentIndex < steps.length - 1) {
      setStep(steps[currentIndex + 1])
    }
  }

  const prevStep = () => {
    const steps: Step[] = ['target', 'threshold', 'rewards', 'confirm']
    const currentIndex = steps.indexOf(step)
    if (currentIndex > 0) {
      setStep(steps[currentIndex - 1])
    }
  }

  const handleSubmit = async () => {
    const request: CreateSessionRequest = {
      targetServerId,
      playerThreshold,
      rewards,
      testMode: testMode || undefined,
      sourceServerIds: testMode ? selectedSourceServerIds : undefined,
    }

    try {
      await createSession.mutateAsync(request)
      onSuccess()
    } catch (error) {
      console.error('Failed to create session:', error)
    }
  }

  const formatDuration = (value: number, unit: RewardUnit): string => {
    return `${value} ${unit}`
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-discord-light rounded-lg shadow-xl w-full max-w-xl mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-discord-lighter">
          <h2 className="text-lg font-semibold text-white">Create Seeding Session</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Indicator */}
        <div className="px-6 py-3 border-b border-discord-lighter">
          <div className="flex items-center gap-2 text-sm">
            {(['target', 'threshold', 'rewards', 'confirm'] as Step[]).map((s, i) => (
              <div key={s} className="flex items-center">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                    step === s
                      ? 'bg-discord-blurple text-white'
                      : i < ['target', 'threshold', 'rewards', 'confirm'].indexOf(step)
                      ? 'bg-green-500 text-white'
                      : 'bg-discord-lighter text-gray-400'
                  }`}
                >
                  {i + 1}
                </div>
                {i < 3 && <div className="w-8 h-0.5 bg-discord-lighter mx-1" />}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4 min-h-[300px] max-h-[60vh] overflow-y-auto">
          {step === 'target' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-white font-medium mb-2 flex items-center gap-2">
                  <Server className="w-4 h-4" />
                  Select Target Server
                </h3>
                <p className="text-gray-400 text-sm mb-4">
                  Choose the server that needs players. {testMode ? 'Select source servers below.' : 'All other servers will receive the seeding call.'}
                </p>
              </div>

              {/* Test Mode Toggle */}
              <div className="bg-discord-lighter rounded-lg p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FlaskConical className="w-4 h-4 text-yellow-500" />
                  <div>
                    <div className="text-white text-sm font-medium">Test Mode</div>
                    <div className="text-gray-400 text-xs">Manually select source servers, bypass player threshold for broadcasts</div>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={testMode}
                    onChange={(e) => {
                      setTestMode(e.target.checked)
                      if (!e.target.checked) {
                        setSelectedSourceServerIds([])
                      }
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-discord-light peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-yellow-500"></div>
                </label>
              </div>

              {loadingServers ? (
                <div className="text-gray-400 text-center py-8">Loading servers...</div>
              ) : (
                <div className="space-y-2">
                  <div className="text-gray-400 text-xs font-medium uppercase tracking-wider">Target Server</div>
                  {servers?.map((server) => (
                    <button
                      key={server.id}
                      onClick={() => setTargetServerId(server.id)}
                      className={`w-full p-3 rounded-lg border text-left transition-colors ${
                        targetServerId === server.id
                          ? 'border-discord-blurple bg-discord-blurple/10'
                          : 'border-discord-lighter hover:border-gray-500'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-white font-medium">{server.name}</div>
                          <div className="text-gray-400 text-sm">{server.id}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400 text-sm">{server.playerCount}/{server.maxPlayers}</span>
                          <span
                            className={`w-2 h-2 rounded-full ${
                              server.connected ? 'bg-green-500' : 'bg-red-500'
                            }`}
                          />
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Source Server Selection (Test Mode Only) */}
              {testMode && targetServerId && availableSourceServers.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-discord-lighter">
                  <div className="text-gray-400 text-xs font-medium uppercase tracking-wider">Source Servers (select at least one)</div>
                  {availableSourceServers.map((server) => (
                    <button
                      key={server.id}
                      onClick={() => toggleSourceServer(server.id)}
                      className={`w-full p-3 rounded-lg border text-left transition-colors ${
                        selectedSourceServerIds.includes(server.id)
                          ? 'border-yellow-500 bg-yellow-500/10'
                          : 'border-discord-lighter hover:border-gray-500'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-white font-medium">{server.name}</div>
                          <div className="text-gray-400 text-sm">{server.id}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400 text-sm">{server.playerCount}/{server.maxPlayers}</span>
                          <span
                            className={`w-2 h-2 rounded-full ${
                              server.connected ? 'bg-green-500' : 'bg-red-500'
                            }`}
                          />
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 'threshold' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-white font-medium mb-2 flex items-center gap-2">
                  <Target className="w-4 h-4" />
                  Player Threshold
                </h3>
                <p className="text-gray-400 text-sm mb-4">
                  The seeding session will automatically close when this many players are on the target server.
                </p>
              </div>
              <div>
                <label className="block text-gray-300 text-sm mb-2">
                  Target Player Count
                </label>
                <input
                  type="number"
                  min={testMode ? 1 : 10}
                  max={99}
                  value={playerThreshold}
                  onChange={(e) => setPlayerThreshold(Math.min(99, parseInt(e.target.value) || (testMode ? 1 : 10)))}
                  className="w-full bg-discord-lighter border border-discord-lighter rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-discord-blurple"
                />
                <p className="text-gray-500 text-xs mt-1">
                  {testMode ? 'Minimum: 1 player (test mode)' : 'Minimum: 10 players'} | Maximum: 99
                </p>
              </div>
              {selectedServer && (
                <div className="bg-discord-lighter rounded-lg p-4 mt-4">
                  <div className="text-gray-400 text-sm">Target Server</div>
                  <div className="text-white font-medium">{selectedServer.name}</div>
                </div>
              )}
            </div>
          )}

          {step === 'rewards' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-white font-medium mb-2 flex items-center gap-2">
                  <Award className="w-4 h-4" />
                  Reward Configuration
                </h3>
                <p className="text-gray-400 text-sm mb-4">
                  Configure the whitelist rewards. All enabled rewards stack additively.
                </p>
              </div>

              {/* Switch Reward */}
              <div className="bg-discord-lighter rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-white font-medium">Switch Reward</label>
                  <input
                    type="checkbox"
                    checked={!!rewards.switch}
                    onChange={(e) =>
                      setRewards({
                        ...rewards,
                        switch: e.target.checked ? { value: 6, unit: 'hours' } : null,
                      })
                    }
                    className="w-4 h-4"
                  />
                </div>
                <p className="text-gray-400 text-xs mb-2">Immediate reward when player switches from source to target</p>
                {rewards.switch && (
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min={1}
                      value={rewards.switch.value}
                      onChange={(e) =>
                        setRewards({
                          ...rewards,
                          switch: { ...rewards.switch!, value: parseInt(e.target.value) || 1 },
                        })
                      }
                      className="w-20 bg-discord-light border border-discord-lighter rounded px-2 py-1 text-white text-sm"
                    />
                    <select
                      value={rewards.switch.unit}
                      onChange={(e) =>
                        setRewards({
                          ...rewards,
                          switch: { ...rewards.switch!, unit: e.target.value as RewardUnit },
                        })
                      }
                      className="bg-discord-light border border-discord-lighter rounded px-2 py-1 text-white text-sm"
                    >
                      <option value="hours">Hours</option>
                      <option value="days">Days</option>
                      <option value="months">Months</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Playtime Reward */}
              <div className="bg-discord-lighter rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-white font-medium">Playtime Reward</label>
                  <input
                    type="checkbox"
                    checked={!!rewards.playtime}
                    onChange={(e) =>
                      setRewards({
                        ...rewards,
                        playtime: e.target.checked
                          ? { value: 12, unit: 'hours', thresholdMinutes: 30 }
                          : null,
                      })
                    }
                    className="w-4 h-4"
                  />
                </div>
                <p className="text-gray-400 text-xs mb-2">Reward after player reaches minimum playtime on target</p>
                {rewards.playtime && (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min={1}
                        value={rewards.playtime.value}
                        onChange={(e) =>
                          setRewards({
                            ...rewards,
                            playtime: { ...rewards.playtime!, value: parseInt(e.target.value) || 1 },
                          })
                        }
                        className="w-20 bg-discord-light border border-discord-lighter rounded px-2 py-1 text-white text-sm"
                      />
                      <select
                        value={rewards.playtime.unit}
                        onChange={(e) =>
                          setRewards({
                            ...rewards,
                            playtime: { ...rewards.playtime!, unit: e.target.value as RewardUnit },
                          })
                        }
                        className="bg-discord-light border border-discord-lighter rounded px-2 py-1 text-white text-sm"
                      >
                        <option value="hours">Hours</option>
                        <option value="days">Days</option>
                        <option value="months">Months</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 text-sm">After</span>
                      <input
                        type="number"
                        min={5}
                        max={120}
                        value={rewards.playtime.thresholdMinutes}
                        onChange={(e) =>
                          setRewards({
                            ...rewards,
                            playtime: {
                              ...rewards.playtime!,
                              thresholdMinutes: parseInt(e.target.value) || 5,
                            },
                          })
                        }
                        className="w-16 bg-discord-light border border-discord-lighter rounded px-2 py-1 text-white text-sm"
                      />
                      <span className="text-gray-400 text-sm">minutes</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Completion Reward */}
              <div className="bg-discord-lighter rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-white font-medium">Completion Reward</label>
                  <input
                    type="checkbox"
                    checked={!!rewards.completion}
                    onChange={(e) =>
                      setRewards({
                        ...rewards,
                        completion: e.target.checked ? { value: 6, unit: 'hours' } : null,
                      })
                    }
                    className="w-4 h-4"
                  />
                </div>
                <p className="text-gray-400 text-xs mb-2">Bonus reward when threshold is reached and player is on target</p>
                {rewards.completion && (
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min={1}
                      value={rewards.completion.value}
                      onChange={(e) =>
                        setRewards({
                          ...rewards,
                          completion: { ...rewards.completion!, value: parseInt(e.target.value) || 1 },
                        })
                      }
                      className="w-20 bg-discord-light border border-discord-lighter rounded px-2 py-1 text-white text-sm"
                    />
                    <select
                      value={rewards.completion.unit}
                      onChange={(e) =>
                        setRewards({
                          ...rewards,
                          completion: { ...rewards.completion!, unit: e.target.value as RewardUnit },
                        })
                      }
                      className="bg-discord-light border border-discord-lighter rounded px-2 py-1 text-white text-sm"
                    >
                      <option value="hours">Hours</option>
                      <option value="days">Days</option>
                      <option value="months">Months</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="bg-discord-blurple/10 border border-discord-blurple/30 rounded-lg p-3">
                <div className="text-discord-blurple text-sm font-medium">
                  Total possible reward: {totalRewardHours} hours whitelist
                </div>
              </div>
            </div>
          )}

          {step === 'confirm' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-white font-medium mb-2 flex items-center gap-2">
                  Confirm Session
                  {testMode && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-yellow-500/20 text-yellow-500 border border-yellow-500/30">
                      <FlaskConical className="w-3 h-3" />
                      Test Mode
                    </span>
                  )}
                </h3>
                <p className="text-gray-400 text-sm mb-4">
                  Review the session configuration before creating.
                </p>
              </div>

              <div className="space-y-3">
                <div className="bg-discord-lighter rounded-lg p-3">
                  <div className="text-gray-400 text-xs">Target Server</div>
                  <div className="text-white font-medium">{selectedServer?.name}</div>
                </div>
                <div className="bg-discord-lighter rounded-lg p-3">
                  <div className="text-gray-400 text-xs">Player Threshold</div>
                  <div className="text-white font-medium">{playerThreshold} players</div>
                </div>
                <div className="bg-discord-lighter rounded-lg p-3">
                  <div className="text-gray-400 text-xs mb-2">Rewards</div>
                  <div className="space-y-1">
                    {rewards.switch && (
                      <div className="text-white text-sm">
                        Switch: +{formatDuration(rewards.switch.value, rewards.switch.unit)}
                      </div>
                    )}
                    {rewards.playtime && (
                      <div className="text-white text-sm">
                        Playtime ({rewards.playtime.thresholdMinutes}min): +
                        {formatDuration(rewards.playtime.value, rewards.playtime.unit)}
                      </div>
                    )}
                    {rewards.completion && (
                      <div className="text-white text-sm">
                        Completion: +{formatDuration(rewards.completion.value, rewards.completion.unit)}
                      </div>
                    )}
                  </div>
                </div>
                <div className="bg-discord-lighter rounded-lg p-3">
                  <div className="text-gray-400 text-xs mb-1">Source Servers (will receive broadcast)</div>
                  <div className="text-white text-sm">
                    {sourceServers.length > 0
                      ? sourceServers.map((s) => s.name).join(', ')
                      : <span className="text-gray-500 italic">None selected</span>
                    }
                  </div>
                </div>
              </div>

              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 flex gap-3">
                <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0" />
                <div className="text-yellow-500 text-sm">
                  {testMode
                    ? 'TEST MODE: Broadcasts will be sent to selected source servers regardless of player count. Messages will include [TEST] prefix.'
                    : 'This will broadcast a seeding call to all source servers. Players will be notified in-game.'
                  }
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-discord-lighter">
          <button
            onClick={step === 'target' ? onClose : prevStep}
            className="flex items-center gap-1 text-gray-400 hover:text-white transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            {step === 'target' ? 'Cancel' : 'Back'}
          </button>
          {step === 'confirm' ? (
            <button
              onClick={handleSubmit}
              disabled={createSession.isPending}
              className={`${
                testMode
                  ? 'bg-yellow-600 hover:bg-yellow-700'
                  : 'bg-discord-blurple hover:bg-discord-blurple/80'
              } disabled:bg-gray-600 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2`}
            >
              {createSession.isPending
                ? 'Creating...'
                : testMode
                ? 'Create Test Session'
                : 'Create Session'}
            </button>
          ) : (
            <button
              onClick={nextStep}
              disabled={!canProceed()}
              className="bg-discord-blurple hover:bg-discord-blurple/80 disabled:bg-gray-600 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-1"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
