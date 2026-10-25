param(
    [Parameter(Mandatory = $true)][string[]]$TextLabels,
    [Parameter(Mandatory = $true)][string[]]$HandwritingLabels,
    [Parameter(Mandatory = $true)][string[]]$Templates,
    [Parameter(Mandatory = $true)][string]$Output,
    [int]$OcrEpochs = 30,
    [int]$ScorerEpochs = 20,
    [ValidateSet('auto', 'cpu', 'cuda')][string]$Device = 'auto',
    [string]$Python = (Join-Path $PSScriptRoot '.local/model-venv/Scripts/python.exe')
)
$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    if (-not (Test-Path -LiteralPath $Python -PathType Leaf)) {
        throw 'Set up the model environment first. See ai_training/START_HERE.md, or pass -Python with its executable path.'
    }
    if (Test-Path -LiteralPath $Output) { throw 'Choose a new Output directory. Existing runs are never overwritten.' }
    foreach ($source in @($TextLabels) + @($HandwritingLabels) + @($Templates)) {
        if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Input file does not exist: $source" }
    }
    $textData = Join-Path $Output 'text-data'
    $ocrData = Join-Path $Output 'ocr-data'
    $ocrRun = Join-Path $Output 'ocr'
    $scorerRun = Join-Path $Output 'scorer'
    $package = Join-Path $Output 'package'
    & $Python -m ai_training prepare --input @TextLabels --output $textData
    if ($LASTEXITCODE -ne 0) { throw 'Text-data preparation failed.' }
    & $Python -m ai_training.pipeline prepare-ocr --input @HandwritingLabels --output $ocrData
    if ($LASTEXITCODE -ne 0) { throw 'Handwriting-data preparation failed.' }
    & $Python -m ai_training.pipeline train-ocr --data $ocrData --output $ocrRun --epochs $OcrEpochs --device $Device
    if ($LASTEXITCODE -ne 0) { throw 'Handwriting training stopped. Keep the run directory to resume from its last checkpoint.' }
    & $Python -m ai_training.pipeline train-scorer --data $textData --output $scorerRun --epochs $ScorerEpochs --device $Device
    if ($LASTEXITCODE -ne 0) { throw 'Scorer training stopped. Keep the run directory to resume from its last checkpoint.' }
    & $Python -m ai_training.pipeline bundle --ocr $ocrRun --scorer $scorerRun --templates @Templates --output $package
    if ($LASTEXITCODE -ne 0) { throw 'Model packaging failed.' }
    Write-Output "Training finished. Unapproved package: $package. Evaluate held-out scans and obtain academic approval before deployment."
} finally {
    Pop-Location
}
