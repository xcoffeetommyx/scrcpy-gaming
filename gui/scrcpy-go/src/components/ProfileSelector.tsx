import { PROFILES } from "../profiles";
import type { Profile } from "../types";

interface ProfileSelectorProps {
  selected: Profile;
  disabled: boolean;
  onChange: (profile: Profile) => void;
}

export function ProfileSelector({
  selected,
  disabled,
  onChange,
}: ProfileSelectorProps) {
  return (
    <fieldset className="panel performance-panel" disabled={disabled}>
      <legend className="sr-only">Performance profile</legend>
      <header className="panel-header">
        <div>
          <span className="panel-kicker">Performance</span>
          <h2>Choose a profile</h2>
        </div>
        <span className="panel-meta">120 FPS target</span>
      </header>

      <div className="profile-list">
        {PROFILES.map((profile) => {
          const checked = selected === profile.id;
          return (
            <label
              className={`profile-card ${checked ? "is-selected" : ""}`}
              key={profile.id}
            >
              <input
                type="radio"
                name="profile"
                value={profile.id}
                checked={checked}
                onChange={() => onChange(profile.id)}
              />
              <span className="profile-card__copy">
                <span className="profile-card__heading">
                  <strong>{profile.name}</strong>
                  <small>{profile.eyebrow}</small>
                </span>
                <span className="profile-card__description">
                  {profile.description}
                </span>
                <span className="profile-card__metrics">
                  {profile.specs.slice(1).map((spec) => (
                    <span key={spec}>{spec}</span>
                  ))}
                </span>
              </span>
              <span className="profile-card__radio" aria-hidden="true">
                <span />
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
