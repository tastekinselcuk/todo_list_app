param([Parameter(Mandatory=$true)][string]$ArchivePath)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Security,System.IO.Compression,System.IO.Compression.FileSystem
$plain=$null;$zip=$null;$memory=$null
try{
  $plain=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes([IO.Path]::GetFullPath($ArchivePath)),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  $memory=New-Object IO.MemoryStream(,$plain)
  $zip=New-Object IO.Compression.ZipArchive($memory,[IO.Compression.ZipArchiveMode]::Read,$false)
  $manifestEntry=$zip.GetEntry('backup-manifest.json')
  if(!$manifestEntry -or $zip.Entries.Count -gt 100000){throw 'INVALID_BACKUP_MANIFEST'}
  $reader=New-Object IO.StreamReader($manifestEntry.Open())
  try{$manifest=$reader.ReadToEnd()|ConvertFrom-Json}finally{$reader.Dispose()}
  $checked=0
  foreach($file in $manifest.files){
    $entry=$zip.GetEntry($file.path)
    if(!$entry -or $entry.Length -ne $file.bytes){throw 'BACKUP_ENTRY_MISMATCH'}
    $hash=[Security.Cryptography.SHA256]::Create();$stream=$entry.Open()
    try{$digest=([BitConverter]::ToString($hash.ComputeHash($stream))).Replace('-','')}finally{$hash.Dispose();$stream.Dispose()}
    if($digest -ne $file.sha256){throw 'BACKUP_HASH_MISMATCH'}
    $checked++
  }
  if($checked -lt 4 -or $zip.Entries.Count -ne $checked+1){throw 'INCOMPLETE_BACKUP'}
  Write-Output ('Archive decrypted and all file hashes verified: '+$checked+' files; Storage objects: '+$manifest.storageObjects)
}finally{
  if($zip){$zip.Dispose()};if($memory){$memory.Dispose()}
  if($plain){[Array]::Clear($plain,0,$plain.Length)}
}
