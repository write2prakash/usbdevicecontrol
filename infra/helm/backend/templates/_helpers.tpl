{{- define "usb-control-backend.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "usb-control-backend.fullname" -}}
{{- include "usb-control-backend.name" . -}}
{{- end -}}
