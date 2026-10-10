; FMSuperScout 24 standalone installer.
; Installeert de viewer en de self-contained 64-bit native memory reader.

#define MyAppName "FMSuperScout 24"
#define MyAppVersion "2.0.0"
#define Stage "..\dist\stage"

[Setup]
AppId={{82D24361-7560-4B39-9FB2-2C3D62AC2401}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher=FMSuperScout
AppPublisherURL=https://github.com/mavarobli/FMSuperScout
DefaultDirName={localappdata}\Programs\FMSuperScout 24
UsePreviousAppDir=no
ArchitecturesInstallIn64BitMode=x64compatible
ArchitecturesAllowed=x64compatible
PrivilegesRequired=lowest
OutputDir=..\dist
OutputBaseFilename=FMSuperScout24-Setup
SetupIconFile=icon.ico
UninstallDisplayIcon={app}\icon.ico
Compression=lzma2/max
SolidCompression=yes
CloseApplications=force
RestartApplications=no
WizardStyle=modern
DisableProgramGroupPage=yes
DisableWelcomePage=no
WizardImageFile=wizard-side.bmp,wizard-side-2x.bmp
WizardSmallImageFile=wizard-small.bmp,wizard-small-2x.bmp
VersionInfoVersion={#MyAppVersion}
VersionInfoCompany=FMSuperScout
VersionInfoDescription=FMSuperScout 24 Setup - scout-tool voor Football Manager 24
VersionInfoCopyright=(c) 2026 mavarobli
AppSupportURL=https://github.com/mavarobli/FMSuperScout/issues
AppUpdatesURL=https://github.com/mavarobli/FMSuperScout/releases

[Languages]
Name: "nl"; MessagesFile: "compiler:Languages\Dutch.isl"
Name: "en"; MessagesFile: "compiler:Default.isl"

[CustomMessages]
nl.FirstRunNote=Klaar. Start FM24, laad een save en klik daarna op "Nieuwe data" in FMSuperScout 24.%n%nDe reader leest fm.exe rechtstreeks uit het geheugen. FM24 hoeft niet opnieuw gestart te worden voor volgende scans.
en.FirstRunNote=Done. Start FM24, load a save, then click "New data" in FMSuperScout 24.%n%nThe reader reads fm.exe directly from memory. FM24 does not need a restart for later scans.

[Files]
Source: "{#Stage}\viewer\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion
Source: "{#Stage}\reader\FMSuperScout24.Reader.exe"; DestDir: "{app}\reader"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\FMSuperScout24.vbs"; WorkingDir: "{app}"; IconFilename: "{app}\icon.ico"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\FMSuperScout24.vbs"; WorkingDir: "{app}"; IconFilename: "{app}\icon.ico"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Run]
Filename: "wscript.exe"; Parameters: """{app}\FMSuperScout24.vbs"""; Description: "FMSuperScout 24 starten"; Flags: postinstall nowait skipifsilent

[Code]
procedure CurPageChanged(CurPageID: Integer);
begin
  if CurPageID = wpFinished then
    WizardForm.FinishedLabel.Caption := CustomMessage('FirstRunNote');
end;
