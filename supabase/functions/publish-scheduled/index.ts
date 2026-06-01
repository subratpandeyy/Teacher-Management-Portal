import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: broadcastCount } = await supabase.rpc("publish_due_broadcasts");

  return new Response(
    JSON.stringify({ published_broadcasts: broadcastCount ?? 0 }),
    { headers: { "Content-Type": "application/json" } }
  );
});
