"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const groupSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500),
});

export async function createGroup(formData: FormData) {
  const parsed = groupSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? "",
  });
  if (!parsed.success) redirect("/dashboard?error=Group%20name%20must%20be%202%20to%2080%20characters");

  const supabase = await createClient();
  if (!supabase) redirect("/dashboard?error=Supabase%20configuration%20is%20required");
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect("/login");

  const { data: groupId, error } = await supabase.rpc("create_group", {
    group_name: parsed.data.name,
    group_description: parsed.data.description || null,
  });
  if (error || !groupId) redirect(`/dashboard?error=${encodeURIComponent(error?.message ?? "Group could not be created")}`);

  revalidatePath("/dashboard");
  redirect(`/groups/${groupId}`);
}
