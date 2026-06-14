{{- define "usb-control-frontend.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "usb-control-frontend.fullname" -}}
{{- include "usb-control-frontend.name" . -}}
{{- end -}}
