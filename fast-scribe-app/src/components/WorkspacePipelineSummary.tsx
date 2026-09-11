import { ChevronRight, FileOutput, Workflow } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface WorkspacePipelineSummaryProps {
  pipelineName: string
  destinationCount: number
  valid: boolean
  outputDir: string
  onEdit: () => void
}

export function WorkspacePipelineSummary({ pipelineName, destinationCount, valid, outputDir, onEdit }: WorkspacePipelineSummaryProps) {
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/45 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-violet-900/80 bg-violet-950/50 text-violet-300">
            <Workflow size={16} />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold text-zinc-100">{pipelineName}</p>
              <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${valid ? 'border-emerald-900/80 text-emerald-300' : 'border-amber-900/80 text-amber-300'}`}>{valid ? 'Selected' : 'Needs repair'}</span>
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              Raw transcript <ChevronRight className="inline" size={12} /> Processed modules <ChevronRight className="inline" size={12} /> Final transcript
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onEdit}>
          Edit pipeline
        </Button>
      </div>
      <div className="mt-4 flex items-center gap-2 border-t border-zinc-800 pt-3 text-xs text-zinc-500">
        <FileOutput size={13} className="text-cyan-400" />
        <span>Primary transcript (.txt) · {destinationCount} additional output{destinationCount === 1 ? '' : 's'} · {outputDir || 'Same folder as each source file'}</span>
      </div>
      <p className="mt-2 text-[11px] leading-4 text-zinc-600">
        This saved pipeline is captured when each transcription starts. Later edits do not change active runs.
      </p>
    </section>
  )
}
