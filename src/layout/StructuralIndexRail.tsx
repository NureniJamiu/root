import { useState } from 'react';

export interface StructuralIndexRailProps {
  readonly nodeCount: number;
}

export function StructuralIndexRail({ nodeCount }: StructuralIndexRailProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<'graph' | 'ledger' | 'corpus' | 'specs'>('graph');

  return (
    <aside
      className="w-[280px] h-full bg-[#fbf9f8] border-r border-[#ebebeb] flex flex-col justify-between shrink-0 select-none z-20"
      style={{ boxShadow: 'none' }}
    >
      {/* Top Section: Structural Index */}
      <div className="flex flex-col">
        {/* Rail Header */}
        <div className="h-10 px-3 border-b border-[#ebebeb] flex items-center justify-between bg-[#ffffff]">
          <span className="font-mono text-[11px] font-medium tracking-[0.04em] uppercase text-[#1b1c1c]">
            Structural Index
          </span>
          <button
            type="button"
            className="text-[#737785] hover:text-[#000000] p-1 transition-colors cursor-pointer"
            title="Toggle Structural Views"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>
          </button>
        </div>

        {/* Index Navigation List */}
        <nav className="flex flex-col py-1">
          {/* 01. Interactive Graph */}
          <button
            type="button"
            onClick={() => setActiveTab('graph')}
            className={`flex items-center justify-between px-3 py-2 text-left transition-colors cursor-pointer border-l-2 ${
              activeTab === 'graph'
                ? 'bg-[#eae8e7] border-[#000000] text-[#000000]'
                : 'border-transparent text-[#404040] hover:bg-[#f0eded] hover:text-[#000000]'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-[12px] font-medium">01.</span>
              <span className="font-serif text-[14px] font-medium">Interactive Graph</span>
            </div>
            <span className="font-mono text-[10px] text-[#595959] bg-[#ffffff] border border-[#ebebeb] px-1.5 py-0.5 rounded-[2px]">
              {nodeCount} {nodeCount === 1 ? 'node' : 'nodes'}
            </span>
          </button>

          {/* 02. Monograph Ledger */}
          <button
            type="button"
            onClick={() => setActiveTab('ledger')}
            className={`flex items-center justify-between px-3 py-2 text-left transition-colors cursor-pointer border-l-2 ${
              activeTab === 'ledger'
                ? 'bg-[#eae8e7] border-[#000000] text-[#000000]'
                : 'border-transparent text-[#404040] hover:bg-[#f0eded] hover:text-[#000000]'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-[12px] font-medium text-[#737785]">02.</span>
              <span className="font-serif text-[14px] text-[#404040]">Monograph Ledger</span>
            </div>
            <span className="font-mono text-[10px] text-[#737785] px-1">
              Empty
            </span>
          </button>

          {/* 03. Cited Corpus & DOIs */}
          <button
            type="button"
            onClick={() => setActiveTab('corpus')}
            className={`flex items-center justify-between px-3 py-2 text-left transition-colors cursor-pointer border-l-2 ${
              activeTab === 'corpus'
                ? 'bg-[#eae8e7] border-[#000000] text-[#000000]'
                : 'border-transparent text-[#404040] hover:bg-[#f0eded] hover:text-[#000000]'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-[12px] font-medium text-[#737785]">03.</span>
              <span className="font-serif text-[14px] text-[#404040]">Cited Corpus & DOIs</span>
            </div>
            <span className="font-mono text-[10px] text-[#737785] px-1">
              0 refs
            </span>
          </button>
        </nav>
      </div>

      {/* Bottom Section: Branch Filter */}
      <div className="border-t border-[#ebebeb] bg-[#ffffff] p-3">
        <div className="font-mono text-[10px] font-medium uppercase tracking-[0.06em] text-[#595959] mb-1">
          Branch Filter
        </div>
        <p className="font-serif text-[12px] italic text-[#737785] m-0">
          No active branches initialized.
        </p>
      </div>
    </aside>
  );
}
