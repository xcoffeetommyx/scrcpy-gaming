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
    <fieldset className="profile-fieldset" disabled={disabled}>
      <legend className="section-heading">
        <span>
          <span className="section-index">02</span>
          Choose your play style
        </span>
        <span className="section-note">You can change this next launch</span>
      </legend>

      <div className="profile-grid">
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
              <span className="profile-card__check" aria-hidden="true">
                <svg viewBox="0 0 20 20">
                  <path d="m5 10 3 3 7-7" />
                </svg>
              </span>
              <span className="profile-card__eyebrow">{profile.eyebrow}</span>
              <strong>{profile.name}</strong>
              <span className="profile-card__description">
                {profile.description}
              </span>
              <span className="spec-list">
                {profile.specs.map((spec) => (
                  <span key={spec}>{spec}</span>
                ))}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
