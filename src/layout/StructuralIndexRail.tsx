import { Button } from '../ui/Button';

export interface ProjectItem {
  readonly id: string;
  readonly title: string;
  readonly nodeCount: number;
  readonly updatedAt?: string;
}

export interface StructuralIndexRailProps {
  readonly nodeCount: number;
  readonly isOpen?: boolean;
  readonly onClose?: () => void;
  readonly projects?: readonly ProjectItem[];
  readonly activeProjectId?: string;
  readonly onSelectProject?: (id: string) => void;
  readonly onNewProject?: () => void;
}

export function StructuralIndexRail({
  nodeCount,
  onClose,
  projects,
  activeProjectId,
  onSelectProject,
  onNewProject,
}: StructuralIndexRailProps): JSX.Element {
  const projectList: readonly ProjectItem[] =
    projects && projects.length > 0
      ? projects
      : [
          {
            id: 'default',
            title: 'Interactive Graph',
            nodeCount,
          },
        ];

  const currentActiveId = activeProjectId ?? projectList[0]?.id ?? 'default';

  return (
    <aside
      className="w-[280px] min-w-[280px] h-full bg-[#fbf9f8] border-r border-[#ebebeb] flex flex-col justify-between shrink-0 select-none z-20"
      style={{ boxShadow: 'none' }}
      data-testid="structural-index-rail"
    >
      {/* Top Section: Projects & Listings */}
      <div className="flex flex-col">
        {/* Rail Header with Close Affordance */}
        <div className="h-10 px-3 border-b border-[#ebebeb] flex items-center justify-between bg-[#ffffff]">
          <div className="flex items-center gap-2">
            <svg
              className="w-3.5 h-3.5 text-[#000000]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
            </svg>
            <span className="font-mono text-[11px] font-medium tracking-[0.04em] uppercase text-[#1b1c1c]">
              Projects
            </span>
          </div>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-[2px] text-[#737785] hover:text-[#000000] hover:bg-[#f0eded] transition-colors cursor-pointer"
              title="Close Projects Sidebar"
              aria-label="Close Projects Sidebar"
              data-testid="btn-close-projects"
            >
              <svg
                className="w-3.5 h-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect width="18" height="18" x="3" y="3" rx="2" />
                <path d="M9 3v18" />
                <path d="m14 9-3 3 3 3" />
              </svg>
            </button>
          )}
        </div>

        {/* New Project Action Button */}
        <div className="p-2 border-b border-[#ebebeb] bg-[#ffffff]">
          <Button
            size="sm"
            variant="cobalt"
            onClick={onNewProject}
            className="w-full justify-center h-8 font-mono text-[11px] bg-[#0051c3] hover:bg-[#003b93] text-[#ffffff] border border-[#0051c3] transition-all cursor-pointer font-medium shadow-sm"
            icon={
              <svg
                className="w-3.5 h-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            }
            data-testid="btn-new-project"
          >
            New Project
          </Button>
        </div>

        {/* Project Listings Navigation */}
        <nav className="flex flex-col py-1 overflow-y-auto max-h-[calc(100vh-210px)]">
          {projectList.map((project, idx) => {
            const isActive = project.id === currentActiveId;
            const indexStr = String(idx + 1).padStart(2, '0') + '.';
            return (
              <button
                key={project.id}
                type="button"
                onClick={() => onSelectProject?.(project.id)}
                className={`flex items-center justify-between px-3 py-2 text-left transition-colors cursor-pointer border-l-2 ${
                  isActive
                    ? 'bg-[#eae8e7] border-[#000000] text-[#000000]'
                    : 'border-transparent text-[#404040] hover:bg-[#f0eded] hover:text-[#000000]'
                }`}
                data-testid={`project-item-${project.id}`}
              >
                <div className="flex items-center gap-2 truncate pr-2">
                  <span
                    className={`font-mono text-[12px] font-medium shrink-0 ${
                      isActive ? 'text-[#000000]' : 'text-[#737785]'
                    }`}
                  >
                    {indexStr}
                  </span>
                  <span className="font-serif text-[13px] font-medium truncate">
                    {project.title || `Project ${idx + 1}`}
                  </span>
                </div>
                <span className="font-mono text-[10px] text-[#595959] bg-[#ffffff] border border-[#ebebeb] px-1.5 py-0.5 rounded-[2px] shrink-0">
                  {project.nodeCount} {project.nodeCount === 1 ? 'node' : 'nodes'}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Section: Active Project Meta */}
      <div className="border-t border-[#ebebeb] bg-[#ffffff] p-3">
        <div className="font-mono text-[10px] font-medium uppercase tracking-[0.06em] text-[#595959] mb-1">
          Workspace Directory
        </div>
        <p className="font-serif text-[12px] text-[#737785] m-0 truncate">
          {projectList.length} {projectList.length === 1 ? 'project' : 'projects'} active in local storage
        </p>
      </div>
    </aside>
  );
}

/**
 * Semantic alias for ProjectsRail
 */
export const ProjectsRail = StructuralIndexRail;
