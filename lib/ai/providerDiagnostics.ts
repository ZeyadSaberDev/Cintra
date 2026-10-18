type DiagnosticTask = { label: string; run: () => Promise<unknown> };

export function runProviderDiagnostics(
  tasks: DiagnosticTask[],
  reportError: (label: string, error: unknown) => void = (label, error) => {
    console.error(`Could not record AI provider diagnostic "${label}":`, error);
  },
): void {
  for (const task of tasks) {
    void Promise.resolve()
      .then(task.run)
      .catch((error: unknown) => {
        try {
          reportError(task.label, error);
        } catch (reportingError) {
          console.error(`Could not report AI provider diagnostic "${task.label}":`, reportingError);
        }
      });
  }
}
