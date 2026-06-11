11s
Run bun run typecheck
$ tsc -p tsconfig.app.json --noEmit
src/App.tsx(25,46): error TS2322: Type 'Promise<typeof import("/home/runner/work/dynamic-plan-pro/dynamic-plan-pro/src/pages/CheckIn")>' is not assignable to type 'Promise<{ default: ComponentType<any>; }>'.
  Property 'default' is missing in type 'typeof import("/home/runner/work/dynamic-plan-pro/dynamic-plan-pro/src/pages/CheckIn")' but required in type '{ default: ComponentType<any>; }'.
Error: Process completed with exit code 2.
