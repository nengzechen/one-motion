import type { Game } from '../types'

interface Props {
  game: Game
  selected: boolean
  onClick: () => void
}

export default function GameCard({ game, selected, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 rounded-lg mb-1 transition-colors ${
        selected
          ? 'bg-indigo-600 text-white'
          : 'text-gray-300 hover:bg-gray-800'
      }`}
    >
      <p className="font-medium text-sm leading-tight">{game.name}</p>
      {game.name_en && (
        <p className={`text-xs mt-0.5 ${selected ? 'text-indigo-200' : 'text-gray-500'}`}>
          {game.name_en}
        </p>
      )}
    </button>
  )
}
