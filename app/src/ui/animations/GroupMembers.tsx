/* The group of the block the Animations panel shows (`model/groups.ts`): its members, each a key
 * that brings that one's settings to the panel, and what takes this block out of the group or
 * undoes it. The members start together and last the same, so the Timing section of any of them
 * is the group's; everything else in the panel is the member's own. */
import { groupMembers, groupOf, type Clip, type ClipAction } from '../../model';
import { useUiStore } from '../../store';
import { describeBlock } from '../timeline/blockDrag';
import { leaveGroup, ungroupBlocks } from './blockActions';
import { blockCategory, blockLabel } from './blockKinds';
import { Section } from './Section';

interface GroupMembersProps {
  clip: Clip;
  /** The member shown in the panel. */
  action: ClipAction;
  /** The clip's track is locked: the group can be read, not changed. */
  locked: boolean;
}

export function GroupMembers({ clip, action, locked }: GroupMembersProps) {
  const select = useUiStore((s) => s.select);
  if (groupOf(action) === undefined) return null;
  const members = groupMembers(clip, action.id);
  return (
    <Section
      title={`Group ×${members.length}`}
      testId="block-group-section"
      tone="animations"
      actions={
        <>
          <button
            type="button"
            className="an-small-button"
            data-testid="block-group-leave"
            title="Take this animation out of the group: it is a block on its own again"
            disabled={locked}
            onClick={() => leaveGroup(clip.id, action.id)}
          >
            Take out
          </button>
          <button
            type="button"
            className="an-small-button"
            data-testid="block-group-ungroup"
            title="Undo the group: its animations are blocks on their own again, where they are"
            disabled={locked}
            onClick={() => ungroupBlocks(clip.id, action.id)}
          >
            Ungroup
          </button>
        </>
      }
    >
      <div className="an-group-members" role="group" aria-label="Animations of the group">
        {members.map((member) => (
          <button
            key={member.id}
            type="button"
            className={`an-group-member${member.id === action.id ? ' is-on' : ''}`}
            data-testid={`block-group-member-${member.id}`}
            aria-pressed={member.id === action.id}
            title={describeBlock(member)}
            onClick={() => select({ kind: 'action', clipId: clip.id, actionId: member.id })}
          >
            <span className={`an-block-chip is-${blockCategory(member)}`}>
              {blockLabel(member)}
            </span>
          </button>
        ))}
      </div>
      <p className="an-hint" data-testid="block-group-hint">
        They start together and last the same: the timing below is the group’s and moves all of
        them. The rest is this animation’s own.
      </p>
    </Section>
  );
}
