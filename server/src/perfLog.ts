export function logPerf(event: string, fields: Record<string, number | string>): void {
  console.log(JSON.stringify({ event, ...fields }));
}
