param([Parameter(Mandatory=$true)][string]$ArchivePath)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Security,System.IO.Compression
$plain=$null;$zip=$null;$memory=$null;$sha=[Security.Cryptography.SHA256]::Create()
try{
 $plain=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes([IO.Path]::GetFullPath($ArchivePath)),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
 $memory=New-Object IO.MemoryStream(,$plain);$zip=New-Object IO.Compression.ZipArchive($memory,[IO.Compression.ZipArchiveMode]::Read,$false)
 if($zip.Entries.Count -gt 100000){throw 'BACKUP_TOO_LARGE'}
 $index=@{}
 foreach($entry in $zip.Entries){$name=$entry.FullName.Replace('\','/');if($index.ContainsKey($name)){throw 'DUPLICATE_BACKUP_ENTRY'};$index[$name]=$entry}
 function Read-ZipText([string]$Name){
  if(!$index.ContainsKey($Name)){throw 'BACKUP_ENTRY_MISSING'}
  $reader=New-Object IO.StreamReader($index[$Name].Open());try{return $reader.ReadToEnd()}finally{$reader.Dispose()}
 }
 $manifest=Read-ZipText 'storage/manifest.json'|ConvertFrom-Json
 $records=@(foreach($record in $manifest.records){
  if($record.filename -notmatch '^[a-f0-9]{64}\.bin$' -or $record.sha256 -notmatch '^[a-f0-9]{64}$'){throw 'INVALID_STORAGE_MANIFEST'}
  $entry=$index['storage/'+$record.filename];if(!$entry){throw 'STORAGE_BACKUP_ENTRY_MISSING'}
  if($entry.Length -gt 52428800){throw 'STORAGE_BACKUP_ENTRY_TOO_LARGE'}
  $buffer=New-Object IO.MemoryStream;$stream=$entry.Open();try{$stream.CopyTo($buffer);$bytes=$buffer.ToArray()}finally{$stream.Dispose();$buffer.Dispose()}
  try{
   if([BitConverter]::ToString($sha.ComputeHash($bytes)).Replace('-','').ToLowerInvariant() -ne $record.sha256){throw 'STORAGE_BACKUP_HASH_MISMATCH'}
   @{bucket=$record.bucket;path=$record.path;contentType=$record.contentType;base64=[Convert]::ToBase64String($bytes);sha256=$record.sha256}
  }finally{[Array]::Clear($bytes,0,$bytes.Length)}
 })
 # Consumed in memory by check-staging; do not redirect this sensitive output into logs.
 @{records=$records}|ConvertTo-Json -Depth 6 -Compress
}finally{if($zip){$zip.Dispose()};if($memory){$memory.Dispose()};if($plain){[Array]::Clear($plain,0,$plain.Length)};$sha.Dispose()}
