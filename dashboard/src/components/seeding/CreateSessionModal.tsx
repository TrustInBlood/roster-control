import { useState } from 'react'
import { X, Server, Target, Award, ChevronRight, ChevronLeft, AlertTriangle } from 'lucide-react'
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
  const [rewards, setRewards] = useState<RewardsConfig>({
    switch: { value: 1, unit: 'days' },
    playtime: { value: 1, unit: 'days', thresholdMinutes: 30 },
    completion: { value: 1, unit: 'days' },
  })

  const { data: servers, isLoading: loadingServers } = useServers()
  const createSession = useCreateSession()

  const selectedServer = servers?.find((s) => s.id === targetServerId)
  const sourceServers = servers?.filter((s) => s.id !== targetServerId) || []

  const totalRewardDays = (() => {
    let total = 0
    if (rewards.switch) {
      total += rewards.switch.unit === 'days' ? rewards.switch.value :
               rewards.switch.value * 30
    }
    if (rewards.playtime) {
      total += rewards.playtime.unit === 'days' ? rewards.playtime.value :
               rewards.playtime.value * 30
    }
    if (rewards.completion) {
      total += rewards.completion.unit === 'days' ? rewards.completion.value :
               rewards.completion.value * 30
    }
    return total
  })()

  const canProceed = () => {
    switch (step) {
      case 'target':
        return !!targetServerId
      case 'threshold':
        return playerThreshold >= 10
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
                  Choose the server that needs players. All other servers will receive the seeding call.
                </p>
              </div>

              {loadingServers ? (
                <div className="text-gray-400 text-center py-8">Loading servers...</div>
              ) : (
                <div className="space-y-2">
                  <div className="text-gray-400 text-xs font-medium uppercase tracking-wider">Target Server</div>
                  {servers?.map((server) => {
                    const isFull = server.playerCount > 60
                    return (
                      <button
                        key={server.id}
                        onClick={() => !isFull && setTargetServerId(server.id)}
                        disabled={isFull}
                        className={`w-full p-3 rounded-lg border text-left transition-colors ${
                          isFull
                            ? 'border-discord-lighter opacity-50 cursor-not-allowed'
                            : targetServerId === server.id
                              ? 'border-discord-blurple bg-discord-blurple/10'
                              : 'border-discord-lighter hover:border-gray-500'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className={`font-medium ${isFull ? 'text-gray-500' : 'text-white'}`}>{server.name}</div>
                            <div className="text-gray-400 text-sm">{server.id}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            {isFull && (
                              <span className="text-red-400 text-xs font-medium">FULL</span>
                            )}
                            <span className="text-gray-400 text-sm">{server.playerCount}/{server.maxPlayers}</span>
                            <span
                              className={`w-2 h-2 rounded-full ${
                                server.connected ? 'bg-green-500' : 'bg-red-500'
                              }`}
                            />
                          </div>
                        </div>
                      </button>
                    )
                  })}
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
                  min={10}
                  max={99}
                  value={playerThreshold}
                  onChange={(e) => setPlayerThreshold(Math.min(99, parseInt(e.target.value) || 10))}
                  className="w-full bg-discord-lighter border border-discord-lighter rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-discord-blurple"
                />
                <p className="text-gray-500 text-xs mt-1">
                  Minimum: 10 players | Maximum: 99
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
                        switch: e.target.checked ? { value: 1, unit: 'days' } : null,
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
                          ? { value: 1, unit: 'days', thresholdMinutes: 30 }
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
                        completion: e.target.checked ? { value: 1, unit: 'days' } : null,
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
                      <option value="days">Days</option>
                      <option value="months">Months</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="bg-discord-blurple/10 border border-discord-blurple/30 rounded-lg p-3">
                <div className="text-discord-blurple text-sm font-medium">
                  Total possible reward: {totalRewardDays} days whitelist
                </div>
              </div>
            </div>
          )}

          {step === 'confirm' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-white font-medium mb-2">
                  Confirm Session
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
                  This will broadcast a seeding call to all source servers. Players will be notified in-game.
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
              className="bg-discord-blurple hover:bg-discord-blurple/80 disabled:bg-gray-600 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2"
            >
              {createSession.isPending ? 'Creating...' : 'Create Session'}
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
