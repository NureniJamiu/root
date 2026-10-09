import { useState } from 'react';
import { Button } from '../ui/Button';
import { RootLogo } from './Logo';
import { PanelLeftIcon } from './panelIcons';

export interface ProjectItem {
  readonly id: string;
  readonly title: string;
  readonly nodeCount: number;
  readonly updatedAt?: string;
}

export interface RailUser {
  readonly name?: string | undefined;
  readonly email: string;
}

export interface StructuralIndexRailProps {
  readonly nodeCount: number;
  readonly onClose?: () => void;
  readonly projects?: readonly ProjectItem[];
  readonly activeProjectId?: string;
  readonly onSelectProject?: (id: string) => void;
  readonly onNewProject?: () => void;
  readonly onDeleteProject?: (id: string) => void;
  readonly onNavigateHome?: () => void;
  readonly user?: RailUser | null;
  readonly onSignOut?: () => void;
}

function initialsFor(user: RailUser): string {
  const source = user.name?.trim() || user.email;
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0]![0]}${parts[1]![0]}` : source.slice(0, 2);
  return letters.toUpperCase();
}

export function StructuralIndexRail({
  nodeCount,
  onClose,
  projects,
  activeProjectId,
  onSelectProject,
  onNewProject,
  onDeleteProject,
  onNavigateHome,
  user,
  onSignOut,
}: StructuralIndexRailProps): JSX.Element {
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const projectList: readonly ProjectItem[] =
    projects && projects.length > 0
      ? projects
      : [
        {
          id: 'default',
          title: 'Idea Canvas',
          nodeCount,
        },
      ];

  const currentActiveId = activeProjectId ?? projectList[0]?.id ?? 'default';

  return (
    <aside
      className="w-[264px] min-w-[264px] h-full bg-[#fbf9f8] border-r border-[#ebebeb] flex flex-col shrink-0 select-none z-20"
      data-testid="structural-index-rail"
    >
      {/* Brand row — same height as the workbench header so the hairlines line up */}
      <div className="h-12 pl-3 pr-2 border-b border-[#ebebeb] flex items-center justify-between bg-[#ffffff] shrink-0">
        <button
          type="button"
          onClick={onNavigateHome}
          disabled={!onNavigateHome}
          className="flex items-center rounded-[2px] hover:opacity-80 transition-opacity cursor-pointer disabled:cursor-default"
          title={onNavigateHome ? 'Back to home' : undefined}
        >
          <RootLogo className="h-8 w-auto" />
        </button>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 inline-flex items-center justify-center rounded-[2px] text-[#737785] hover:text-[#000000] hover:bg-[#f0eded] transition-colors cursor-pointer"
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
            data-testid="btn-close-projects"
          >
            <PanelLeftIcon className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Section heading + primary action */}
      <div className="px-3 pt-4 pb-3 flex flex-col gap-3 shrink-0">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] font-medium tracking-[0.08em] uppercase text-[#595959]">
            Projects
          </span>
          <span className="font-mono text-[10px] text-[#737785]">{projectList.length}</span>
        </div>
        <Button
          size="sm"
          variant="cobalt"
          onClick={onNewProject}
          className="w-full h-10 bg-[#0051c3] text-[11px] uppercase"
          icon={
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          }
          data-testid="btn-new-project"
        >
          New Project
        </Button>
      </div>

      {/* Project list */}
      <nav className="flex-1 min-h-0 overflow-y-auto px-2 pb-3 flex flex-col gap-px" aria-label="Projects">
        {projectList.map((project, idx) => {
          const isActive = project.id === currentActiveId;
          const isConfirmingDelete = pendingDeleteId === project.id;
          const title = project.title || `Project ${idx + 1}`;
          return (
            <div
              key={project.id}
              onClick={() => onSelectProject?.(project.id)}
              onMouseLeave={() => isConfirmingDelete && setPendingDeleteId(null)}
              // Rows sit flat on the rail: no box, just a soft tint for the
              // open project and on hover, so the list reads as part of the nav.
              className={`group relative flex items-center gap-2 pl-3 pr-1.5 py-2 rounded-[4px] text-left transition-colors cursor-pointer ${
                isActive ? 'bg-[#efedec] text-[#000000]' : 'text-[#595959] hover:bg-[#f3f1f0] hover:text-[#000000]'
              }`}
              data-testid={`project-item-${project.id}`}
            >
              {isActive && (
                <span className="absolute left-0 top-2.5 bottom-2.5 w-[2px] rounded-full bg-[#0051c3]" aria-hidden="true" />
              )}
              {/* The row's one real control: Enter/Space on it bubbles up to the row's click handler. */}
              <button
                type="button"
                aria-current={isActive ? 'page' : undefined}
                className="flex flex-col min-w-0 flex-1 text-left bg-transparent border-0 p-0 cursor-pointer focus-visible:outline focus-visible:outline-1 focus-visible:outline-[#0051c3]"
              >
                <span className={`font-serif text-[14px] leading-[20px] truncate ${isActive ? 'font-medium' : ''}`}>{title}</span>
              </button>

              {onDeleteProject &&
                (isConfirmingDelete ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPendingDeleteId(null);
                      onDeleteProject(project.id);
                    }}
                    className="shrink-0 h-6 px-2 font-mono text-[9.5px] font-medium rounded-[2px] bg-[#ba1a1a] text-[#ffffff] hover:bg-[#93000a] transition-colors cursor-pointer"
                    data-testid={`btn-confirm-delete-project-${project.id}`}
                  >
                    Delete?
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPendingDeleteId(project.id);
                    }}
                    className="shrink-0 w-6 h-6 inline-flex items-center justify-center text-[#737785] hover:text-[#ba1a1a] hover:bg-[#e8e5e4] rounded-[2px] transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100 cursor-pointer"
                    title={`Delete ${title}`}
                    aria-label={`Delete ${title}`}
                    data-testid={`btn-delete-project-${project.id}`}
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18" />
                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                    </svg>
                  </button>
                ))}
            </div>
          );
        })}
      </nav>

      {/* Account footer: sign out, then the signed-in profile beneath it */}
      {(onSignOut || user) && (
        <div className="border-t border-[#ebebeb] bg-[#ffffff] p-2 flex flex-col gap-1 shrink-0">
          {onSignOut && (
            <button
              type="button"
              onClick={onSignOut}
              className="h-8 px-2 flex items-center gap-2 rounded-[2px] font-mono text-[11px] text-[#ba1a1a] bg-[#fdf2f2] hover:bg-[#f9dede] transition-colors cursor-pointer"
              data-testid="btn-sign-out"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Sign out
            </button>
          )}

          {user && (
            <div className="flex items-center gap-2.5 px-2 py-2 border-t border-[#f0eded]" data-testid="rail-user-profile">
              <div
                className="w-8 h-8 rounded-full bg-[#0051c3] text-[#ffffff] flex items-center justify-center shrink-0 font-mono text-[11px] font-medium"
                aria-hidden="true"
              >
                {initialsFor(user)}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-serif text-[13px] font-medium leading-[16px] text-[#000000] truncate">
                  {user.name?.trim() || 'Your account'}
                </span>
                <span className="font-mono text-[9.5px] text-[#737785] truncate" title={user.email}>
                  {user.email}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}

/**
 * Semantic alias for ProjectsRail
 */
export const ProjectsRail = StructuralIndexRail;
