// Supabase Edge Function: compare a technician's live selfie with the face on their ID card.
// Called by the app right after the technician uploads documents (their own JWT), or by an admin with { user_id }.
// Models live in the private Storage bucket "ml-models"; the native ONNX runtime of the Edge runtime runs them.
import { createHandler } from './handler.ts';
import type { Ort } from './face.ts';

let engine: string | undefined;
const handler = createHandler({
  engineName: () => engine,
  supabaseUrl: Deno.env.get('SUPABASE_URL')!,
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  fetch: (...a) => fetch(...a),
  getOrt: async (download) => {
    const native = (globalThis as Record<symbol, unknown>)[Symbol.for('onnxruntime')] as Ort | undefined;
    if (native) { engine = 'native'; return native; }
    // fallback: WebAssembly build (slower cold start, same results)
    const web = await import('npm:onnxruntime-web@1.20.1');
    web.env.wasm.numThreads = 1;
    web.env.wasm.wasmBinary = (await download('ort-wasm-simd-threaded-1.20.1.wasm')).buffer;
    engine = 'wasm';
    return web as unknown as Ort;
  },
});

Deno.serve(handler);
