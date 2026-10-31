; apolloDJ — Inno Setup 6
; Visual language aligns with Apollo registry: "Apollo Nav v6 — Luxury Minimalist" + blank-canvas restraint.
; Version: MUST match wp-content/plugins/_inventory/apollo-registry.json + apolloDJ-registry meta.version lineage.
; Wizard bitmaps: white field, grayscale typography.

#ifndef AppVersion

#define AppVersion "2.0.0"

#endif

#ifndef AppPublisher

#define AppPublisher "apollo.rio.br"

#endif



#define MyAppName "apolloDJ"

#define DistRoot "..\dist_002\apolloDJ"
#define P2pStaging "..\deploy\p2p"



[Setup]

AppId={{8E294B4A-F5C9-4123-95C1-D4AF5E6BD2A9}

AppName={#MyAppName}

AppVersion={#AppVersion}

AppVerName={#MyAppName} {#AppVersion}

AppPublisher={#AppPublisher}

AppPublisherURL=https://apollo.rio.br/

DefaultDirName={autopf}\{#MyAppName}

DefaultGroupName={#MyAppName}

AllowNoIcons=yes

OutputDir=output

OutputBaseFilename=apolloDJ Setup

SetupIconFile=..\..\src_002\icon.ico

Compression=lzma2

SolidCompression=yes

WizardStyle=modern

PrivilegesRequired=admin

PrivilegesRequiredOverridesAllowed=dialog commandline

ArchitecturesAllowed=x64compatible

ArchitecturesInstallIn64BitMode=x64compatible

MinVersion=10.0

; v7 hardening — refuse to install / uninstall while apolloDJ is running.
; The mutex name must match what the running exe creates (CreateMutexW).
AppMutex={#MyAppName}_SingletonMutex

; If the exe IS running, prompt to close gracefully then continue.
CloseApplications=force

RestartApplications=no

; Force LZMA2 ultra so installer fits a single floppy-style download.
LZMAUseSeparateProcess=yes

LicenseFile=..\..\_superseeded\apolloDJ-exe\installer\APOLLO_LICENSE.txt

InfoBeforeFile=..\..\_superseeded\apolloDJ-exe\installer\INSTALL_NOTES.txt

UninstallDisplayIcon={app}\apolloDJ.exe

UninstallDisplayName={#MyAppName}

DisableProgramGroup=no

WizardImageStretch=no

WizardImageBackColor=FFFFFF

WizardImageFile=..\..\_superseeded\apolloDJ-exe\installer\assets\wizard-large.bmp

WizardSmallImageFile=..\..\_superseeded\apolloDJ-exe\installer\assets\wizard-small.bmp



[Languages]

Name: "english"; MessagesFile: "compiler:Default.isl"

Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"



[Tasks]

Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

Name: "createuserfolders"; Description: "Criar pastas do usuário em %USERPROFILE%\apolloDJ\ (pt-BR premium)"; GroupDescription: "Estrutura de pastas:"; Flags: checkedonce



[Dirs]

; ═══════════════════════════════════════════════════════════════
; pt-BR PREMIUM FOLDER SKELETON — created under %USERPROFILE%\apolloDJ\
; Mirrors apollodj.conf.paths._DIRS_TO_CREATE exactly. The exe also
; runs ensure_paths() on first launch as a safety net (idempotent).
; Hidden flag on the base folder matches paths.py SetFileAttributesW.
; ═══════════════════════════════════════════════════════════════

Name: "{userdocs}\..\apolloDJ"; Attribs: hidden; Tasks: createuserfolders

Name: "{userdocs}\..\apolloDJ\Tracks";                                                   Tasks: createuserfolders
Name: "{userdocs}\..\apolloDJ\Tracks\0. Em Análise";                                     Tasks: createuserfolders
Name: "{userdocs}\..\apolloDJ\Tracks\Coletânea";                                         Tasks: createuserfolders
Name: "{userdocs}\..\apolloDJ\Tracks\2. Duvidosos";                                      Tasks: createuserfolders
Name: "{userdocs}\..\apolloDJ\Tracks\2. Duvidosos\1. Arquivo duvidoso";                  Tasks: createuserfolders
Name: "{userdocs}\..\apolloDJ\Tracks\2. Duvidosos\2. Download falhado";                  Tasks: createuserfolders
Name: "{userdocs}\..\apolloDJ\Tracks\2. Duvidosos\3. Falha de amplificação";             Tasks: createuserfolders
Name: "{userdocs}\..\apolloDJ\Tracks\1. Relatórios";                                     Tasks: createuserfolders
Name: "{userdocs}\..\apolloDJ\Tracks\3. Transferências";                                 Tasks: createuserfolders

Name: "{userdocs}\..\apolloDJ\Playlists";                                                Tasks: createuserfolders

Name: "{userdocs}\..\apolloDJ\Pendrives";                                                Tasks: createuserfolders
Name: "{userdocs}\..\apolloDJ\Pendrives\Exportados";                                     Tasks: createuserfolders

Name: "{userdocs}\..\apolloDJ\Caixa de Entrada";                                         Tasks: createuserfolders
Name: "{userdocs}\..\apolloDJ\Caixa de Entrada\Nicotine";                                Tasks: createuserfolders
Name: "{userdocs}\..\apolloDJ\Caixa de Entrada\PlaylistImports";                         Tasks: createuserfolders

Name: "{userdocs}\..\apolloDJ\Dados";                                                    Tasks: createuserfolders
Name: "{userdocs}\..\apolloDJ\Dados\espectrogramas";                                     Tasks: createuserfolders
Name: "{userdocs}\..\apolloDJ\Dados\temp_wav";                                           Tasks: createuserfolders
Name: "{userdocs}\..\apolloDJ\Dados\analises";                                           Tasks: createuserfolders

Name: "{userdocs}\..\apolloDJ\Registros";                                                Tasks: createuserfolders

Name: "{userdocs}\..\apolloDJ\Relatórios";                                               Tasks: createuserfolders

Name: "{userdocs}\..\apolloDJ\Configurações";                                            Tasks: createuserfolders
Name: "{userdocs}\..\apolloDJ\Configurações\backups";                                    Tasks: createuserfolders



[Files]

Source: "{#DistRoot}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

; Embedded Collab P2P engine (headless nicotine.exe + locked config template) — ONE apolloDJ product
Source: "{#P2pStaging}\*"; DestDir: "{app}\p2p"; Flags: ignoreversion recursesubdirs createallsubdirs skipifsourcedoesntexist



[Icons]

Name: "{group}\{#MyAppName}"; Filename: "{app}\apolloDJ.exe"

Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"

Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\apolloDJ.exe"; Tasks: desktopicon



[Run]

; v7 hardening — defensively kill any apolloDJ.exe still in memory before
; file copy (in case AppMutex / CloseApplications missed a child process).
Filename: "{cmd}"; Parameters: "/C taskkill /IM apolloDJ.exe /F /T"; Flags: runhidden waituntilterminated; StatusMsg: "Fechando apolloDJ se estiver aberto..."

Filename: "{app}\apolloDJ.exe"; Description: "{cm:LaunchProgram,{#MyAppName}}"; Flags: nowait postinstall skipifsilent



[Code]



procedure MinimalWhiteChrome;

begin

  WizardForm.Color := clWhite;

  WizardForm.InnerNotebook.Color := clWhite;

  WizardForm.OuterNotebook.Color := clWhite;



  WizardForm.PageNameLabel.Font.Color := $1A1A1A;

  WizardForm.PageDescriptionLabel.Font.Color := $595959;



  if WizardForm.DirEdit <> nil then

    WizardForm.DirEdit.Color := clWhite;

  if WizardForm.GroupEdit <> nil then

    WizardForm.GroupEdit.Color := clWhite;

end;



procedure InitializeWizard;

begin

  MinimalWhiteChrome;

end;



procedure CurPageChanged(CurPageID: Integer);

begin

  MinimalWhiteChrome;

end;
