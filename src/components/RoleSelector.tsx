export type AppEntry = 'add' | 'review'

interface Props {
  onSelect: (entry: AppEntry) => void
}

export function EntrySelector({ onSelect }: Props) {
  return (
    <div className="role-selector-overlay">
      <div className="role-selector">
        <div className="role-selector-logo">
          Deal<span>Flow</span>
        </div>
        <h1>What do you want to do?</h1>
        <div className="role-cards">
          <button className="role-card" onClick={() => onSelect('add')}>
            <div className="role-card-icon">+</div>
            <h2>Add</h2>
          </button>
          <button className="role-card role-card-reviewer" onClick={() => onSelect('review')}>
            <div className="role-card-icon">✓</div>
            <h2>Review</h2>
          </button>
        </div>
      </div>
    </div>
  )
}
