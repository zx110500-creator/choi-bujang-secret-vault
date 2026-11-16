# Device approval

The device approval API stores requests in `public.device_approvals`. Apply
`supabase/migrations/20261116000000_device_approvals.sql` in the Supabase SQL
Editor before deploying. Only the server's service-role key can read or change
these rows; never expose that key to the browser.

After login, `GET /api/device-approval` issues an HttpOnly device cookie when
needed and returns `not_requested`, `pending`, `approved`, or `revoked`.
`POST /api/device-approval` creates a pending row; it never approves a device.
An operator approves a reviewed request by changing that row to `approved`
and setting `approved_at = now()`. The browser only requests notes after a
subsequent server status response is `approved`.

In Supabase SQL Editor, review pending rows and approve only the selected,
verified device:

```sql
select owner_id, device_id, requested_at
from public.device_approvals
where status = 'pending';

update public.device_approvals
set status = 'approved', approved_at = now()
where owner_id = '<reviewed-owner-uuid>'::uuid
  and device_id = '<reviewed-device-id>'
  and status = 'pending';
```

For browser verification, log in, select **기기 승인 요청**, and confirm that
the protected section stays hidden while the request is pending. After an
operator approves the row in Supabase, reload the page; the same browser
device should open the notes.

For API verification, create a private curl cookie jar by entering your login
locally at secure prompts. The password is sent only to your deployment's login
endpoint; the jar contains HttpOnly session cookies, so keep it outside the
repository and delete it when finished:

```powershell
$base = 'https://choi-bujang-secret-vault-tau-one.vercel.app'
$jar = Join-Path $env:TEMP 'aleph-device-test-cookies.txt'
$email = Read-Host 'Account email'
$securePassword = Read-Host 'Password' -AsSecureString
$plainPassword = [System.Net.NetworkCredential]::new('', $securePassword).Password
$loginBody = @{ email = $email; password = $plainPassword } | ConvertTo-Json -Compress
$loginBody | curl.exe -sS -c $jar -H 'content-type: application/json' --data-binary '@-' "$base/api/auth/login"
Remove-Variable email, securePassword, plainPassword, loginBody

curl.exe -i -b $jar -c $jar "$base/api/device-approval"
curl.exe -i -b $jar -c $jar "$base/api/notes"
curl.exe -i -b $jar -c $jar -H 'content-type: application/json' --data '{}' "$base/api/device-approval"
```

Before approval, the notes request must return `403 DEVICE_NOT_APPROVED` and
no notes. After the operator approves the row in Supabase, run the status and
notes requests again; the status must return `{"status":"approved"}` and the
notes request may return that user's notes:

```powershell
curl.exe -i -b $jar -c $jar "$base/api/device-approval"
curl.exe -i -b $jar -c $jar "$base/api/notes"
Remove-Item -LiteralPath $jar
```
