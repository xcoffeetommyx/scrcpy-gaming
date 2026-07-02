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
      <legend className="section-title">
        <span>Performance profile</span>
        <small>All profiles target 120 FPS</small>
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
              <span className="profile-card__radio" aria-hidden="true">
                <span />
              </span>
              <span className="profile-card__copy">
                <strong>{profile.name}</strong>
                <span>{profile.specs.slice(1).join(" · ")}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
