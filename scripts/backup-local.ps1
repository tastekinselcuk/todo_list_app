param(
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-z0-9]{16,24}$')][string]$ProjectRef,
  [ValidateRange(2,30)][int]$Keep=7
)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Security,System.IO.Compression,System.IO.Compression.FileSystem
$repoRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$backupRoot=[IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA ('Pomodolist/Backups/'+$ProjectRef)))
$workRoot=Join-Path $backupRoot ('work-'+[guid]::NewGuid().ToString('N'))
$mutex=New-Object Threading.Mutex($false,('Local\PomodolistBackup-'+$ProjectRef))
$acquired=$false
$stage='initialize'
function Set-PrivateDirectory([string]$Path){
  [IO.Directory]::CreateDirectory($Path)|Out-Null
  $currentSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  & icacls.exe $Path '/inheritance:r' '/grant:r' ('*'+$currentSid+':(OI)(CI)F') '*S-1-5-18:(OI)(CI)F'|Out-Null
  if($LASTEXITCODE -ne 0){throw 'BACKUP_DIRECTORY_PERMISSIONS_FAILED'}
  $acl=Get-Acl -LiteralPath $Path
  foreach($rule in $acl.Access){
    $sid=$rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
    if($rule.AccessControlType -eq 'Allow' -and $sid -notin @($currentSid,'S-1-5-18')){throw 'BACKUP_DIRECTORY_NOT_PRIVATE'}
  }
}
function Invoke-BackupCli([string[]]$CliArguments){
  $previousPreference=$ErrorActionPreference
  try{
    $ErrorActionPreference='Continue'
    $text=& npx.cmd --yes supabase@3.0.0 @CliArguments 2> (Join-Path $workRoot 'cli-stderr.log')
    $commandExit=$LASTEXITCODE
  }finally{$ErrorActionPreference=$previousPreference}
  if($commandExit -ne 0){throw 'BACKUP_CLI_FAILED'}
  return ($text -join "`n")
}
try{
  try{$acquired=$mutex.WaitOne(0)}catch [Threading.AbandonedMutexException]{$acquired=$true}
  if(!$acquired){Write-Output 'A backup is already running.';exit 0}
  Set-PrivateDirectory $backupRoot
  # A terminated previous process may leave a private plaintext staging folder.
  foreach($orphan in Get-ChildItem -LiteralPath $backupRoot -Directory -Filter 'work-*'){
    $orphanPath=[IO.Path]::GetFullPath($orphan.FullName)
    $expired=$orphan.LastWriteTimeUtc -lt [DateTime]::UtcNow.AddDays(-1)
    $withinRoot=$orphanPath.StartsWith($backupRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)
    if($orphan.Name -match '^work-[0-9a-f]{32}$' -and $expired -and $withinRoot){
      Remove-Item -LiteralPath $orphanPath -Recurse -Force
    }
  }
  Set-PrivateDirectory $workRoot
  Push-Location $repoRoot
  try{
    $stage='schema'
    Invoke-BackupCli @('db','dump',('--remote='+$ProjectRef),'--schema','public,private,auth,storage,supabase_migrations','--file',(Join-Path $workRoot 'schema.sql'))|Out-Null
    $stage='data'
    Invoke-BackupCli @('db','dump',('--remote='+$ProjectRef),'--schema','public,private,auth,storage,supabase_migrations','--data-only','--use-copy','--file',(Join-Path $workRoot 'data.sql'))|Out-Null
    $stage='roles'
    Invoke-BackupCli @('db','dump',('--remote='+$ProjectRef),'--role-only','--file',(Join-Path $workRoot 'roles.sql'))|Out-Null
    $stage='storage'
    $storageRoot=Join-Path $workRoot 'storage'
    $storageResult=& node.exe (Join-Path $PSScriptRoot 'backup-storage.mjs') $ProjectRef $storageRoot
    if($LASTEXITCODE -ne 0){throw 'BACKUP_STORAGE_FAILED'}
    $storageCount=($storageResult|ConvertFrom-Json).storageObjects
  }finally{Pop-Location}
  Remove-Item -LiteralPath (Join-Path $workRoot 'cli-stderr.log') -ErrorAction SilentlyContinue
  $stage='encrypt'
  $manifest=Get-ChildItem -LiteralPath $workRoot -File -Recurse|ForEach-Object{
    @{path=$_.FullName.Substring($workRoot.Length+1);bytes=$_.Length;sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash}
  }
  @{project=$ProjectRef;createdAt=[DateTime]::UtcNow.ToString('o');files=@($manifest);protection='Windows DPAPI CurrentUser';storageObjects=$storageCount}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $workRoot 'backup-manifest.json') -Encoding UTF8
  $memory=New-Object IO.MemoryStream
  $zip=New-Object IO.Compression.ZipArchive($memory,[IO.Compression.ZipArchiveMode]::Create,$true)
  try{foreach($file in Get-ChildItem -LiteralPath $workRoot -File -Recurse){[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,$file.FullName,$file.FullName.Substring($workRoot.Length+1),[IO.Compression.CompressionLevel]::Optimal)|Out-Null}}finally{$zip.Dispose()}
  $plain=$memory.ToArray();$memory.Dispose()
  $encrypted=[Security.Cryptography.ProtectedData]::Protect($plain,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  $restored=[Security.Cryptography.ProtectedData]::Unprotect($encrypted,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  $sha=[Security.Cryptography.SHA256]::Create()
  if([Convert]::ToBase64String($sha.ComputeHash($plain)) -ne [Convert]::ToBase64String($sha.ComputeHash($restored))){throw 'BACKUP_VERIFICATION_FAILED'}
  $sha.Dispose()
  $archive=Join-Path $backupRoot ([DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ')+'.zip.dpapi')
  [IO.File]::WriteAllBytes($archive,$encrypted)
  $stored=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($archive),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  $fileHash=[Security.Cryptography.SHA256]::Create()
  try{if([Convert]::ToBase64String($fileHash.ComputeHash($plain)) -ne [Convert]::ToBase64String($fileHash.ComputeHash($stored))){throw 'BACKUP_FILE_VERIFICATION_FAILED'}}finally{$fileHash.Dispose();[Array]::Clear($stored,0,$stored.Length)}
  [Array]::Clear($plain,0,$plain.Length);[Array]::Clear($restored,0,$restored.Length)
  $success=@{success=$true;createdAt=[DateTime]::UtcNow.ToString('o');archive=[IO.Path]::GetFileName($archive);storageObjects=$storageCount;bytes=$encrypted.Length}
  $success|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $backupRoot 'latest-status.json') -Encoding UTF8
  $success|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $backupRoot 'latest-attempt.json') -Encoding UTF8
  Get-ChildItem -LiteralPath $backupRoot -File -Filter '*.zip.dpapi'|Sort-Object Name -Descending|Select-Object -Skip $Keep|ForEach-Object{
    if(![IO.Path]::GetFullPath($_.FullName).StartsWith($backupRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'INVALID_BACKUP_PATH'}
    Remove-Item -LiteralPath $_.FullName
  }
  Write-Output ('Encrypted local backup verified; Storage objects: '+$storageCount)
}catch{
  if(Test-Path -LiteralPath $backupRoot){@{success=$false;createdAt=[DateTime]::UtcNow.ToString('o');error='BACKUP_FAILED';stage=$stage;exception=$_.Exception.GetType().Name}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $backupRoot 'latest-attempt.json') -Encoding UTF8}
  throw 'Local backup failed. Existing successful backups have been preserved.'
}finally{
  $absoluteWork=[IO.Path]::GetFullPath($workRoot)
  if($absoluteWork.StartsWith($backupRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -and [IO.Path]::GetFileName($absoluteWork) -match '^work-[0-9a-f]{32}$' -and (Test-Path -LiteralPath $absoluteWork)){
    Remove-Item -LiteralPath $absoluteWork -Recurse -Force
  }
  if($acquired){$mutex.ReleaseMutex()}
  $mutex.Dispose()
}
