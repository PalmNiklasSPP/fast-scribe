import * as Dialog from '@radix-ui/react-dialog'
import { AlertTriangle, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { PendingTranscriptOverwrite } from '@/lib/types'

interface OverwriteConfirmationDialogProps {
  overwrite: PendingTranscriptOverwrite | null
  onCancel: () => void
  onConfirm: () => void
}

export function OverwriteConfirmationDialog({
  overwrite,
  onCancel,
  onConfirm,
}: OverwriteConfirmationDialogProps) {
  if (!overwrite) return null

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl focus:outline-none">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-amber-500/10 p-2 text-amber-400">
              <AlertTriangle size={20} />
            </div>
            <div className="min-w-0">
              <Dialog.Title className="text-base font-semibold text-zinc-100">
                Overwrite transcript?
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm leading-6 text-zinc-400">
                Transcribing {overwrite.fileName} will replace the existing transcript.
              </Dialog.Description>
            </div>
          </div>

          <div className="mt-5 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
            <div className="flex items-center gap-2 text-xs font-medium text-zinc-400">
              <FileText size={14} />
              Existing transcript
            </div>
            <p className="mt-1 break-all font-mono text-xs leading-5 text-zinc-300">
              {overwrite.outputPath}
            </p>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={onConfirm}>
              Overwrite
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
