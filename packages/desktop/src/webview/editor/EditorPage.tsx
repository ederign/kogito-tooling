/*
 * Copyright 2020 Red Hat, Inc. and/or its affiliates.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { ChannelType, EditorContent } from "@kogito-tooling/core-api";
import { EditorType, EmbeddedEditor, EmbeddedEditorRef } from "@kogito-tooling/embedded-editor";
import "@patternfly/patternfly/patternfly.css";
import { Alert, AlertActionCloseButton, Page, PageSection, Stack, StackItem } from "@patternfly/react-core";
import * as electron from "electron";
import * as React from "react";
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { File, FileSaveActions } from "../../common/File";
import { GlobalContext } from "../common/GlobalContext";
import { EditorToolbar } from "./EditorToolbar";
import IpcRendererEvent = Electron.IpcRendererEvent;

interface Props {
  editorType: string;
  onClose: () => void;
}

enum ContentRequestActionType {
  NONE,
  SAVE,
  DOWNLOAD,
  COPY
}

enum PreviewRequestActionType {
  NONE,
  SAVE,
  THUMBNAIL
}

const ALERT_AUTO_CLOSE_TIMEOUT = 3000;

// FIXME: These variables should be moved inside the React hooks lifecycle.
let contentRequestAction = ContentRequestActionType.NONE;
let contentRequestData: { action: FileSaveActions; file?: File };

let previewRequestAction = PreviewRequestActionType.NONE;

export function EditorPage(props: Props) {
  const context = useContext(GlobalContext);
  const editorRef = useRef<EmbeddedEditorRef>(null);
  const copyContentTextArea = useRef<HTMLTextAreaElement>(null);

  const [copySuccessAlertVisible, setCopySuccessAlertVisible] = useState(false);
  const [saveFileSuccessAlertVisible, setSaveFileSuccessAlertVisible] = useState(false);
  const [savePreviewSuccessAlertVisible, setSavePreviewSuccessAlertVisible] = useState(false);

  const requestSaveFile = useCallback(() => {
    contentRequestAction = ContentRequestActionType.SAVE;
    editorRef.current?.requestContent();
  }, []);

  const requestCopyContentToClipboard = useCallback(() => {
    contentRequestAction = ContentRequestActionType.COPY;
    editorRef.current?.requestContent();
  }, []);

  const requestSavePreview = useCallback(() => {
    previewRequestAction = PreviewRequestActionType.SAVE;
    editorRef.current?.requestPreview();
  }, []);

  const requestThumbnailPreview = useCallback(() => {
    previewRequestAction = PreviewRequestActionType.THUMBNAIL;
    editorRef.current?.requestPreview();
  }, []);

  const closeCopySuccessAlert = useCallback(() => setCopySuccessAlertVisible(false), []);
  const closeSaveFileSuccessAlert = useCallback(() => setSaveFileSuccessAlertVisible(false), []);
  const closeSavePreviewSuccessAlert = useCallback(() => setSavePreviewSuccessAlertVisible(false), []);

  const onContentResponse = useCallback(
    (content: EditorContent) => {
      if (contentRequestAction === ContentRequestActionType.SAVE) {
        contentRequestData.file = {
          filePath: context.file!.filePath,
          fileType: context.file!.fileType,
          fileContent: content.content
        };
        electron.ipcRenderer.send("saveFile", contentRequestData);
      } else if (contentRequestAction === ContentRequestActionType.COPY && copyContentTextArea.current) {
        copyContentTextArea.current.value = content.content;
        copyContentTextArea.current.select();
        if (document.execCommand("copy")) {
          setCopySuccessAlertVisible(true);
        }
      }
    },
    [contentRequestData, copyContentTextArea.current, context.file!.filePath, context.file!.fileType]
  );

  const onPreviewResponse = useCallback(
    preview => {
      if (previewRequestAction === PreviewRequestActionType.SAVE) {
        electron.ipcRenderer.send("savePreview", {
          filePath: context.file!.filePath,
          fileType: "svg",
          fileContent: preview
        });
      } else if (previewRequestAction === PreviewRequestActionType.THUMBNAIL) {
        electron.ipcRenderer.send("saveThumbnail", {
          filePath: context.file!.filePath,
          fileType: "svg",
          fileContent: preview
        });
      }
    },
    [previewRequestAction, context.file!.filePath]
  );

  const saveFile = useCallback(() => {
    contentRequestData = {
      action: FileSaveActions.SAVE
    };
    requestSaveFile();
  }, [requestSaveFile]);

  useEffect(() => {
    if (copySuccessAlertVisible) {
      const autoCloseCopySuccessAlert = setTimeout(closeCopySuccessAlert, ALERT_AUTO_CLOSE_TIMEOUT);
      return () => clearInterval(autoCloseCopySuccessAlert);
    }

    return () => {
      /* Do nothing */
    };
  }, [copySuccessAlertVisible, closeCopySuccessAlert]);

  useEffect(() => {
    if (saveFileSuccessAlertVisible) {
      const autoCloseSaveFileSuccessAlert = setTimeout(closeSaveFileSuccessAlert, ALERT_AUTO_CLOSE_TIMEOUT);
      return () => clearInterval(autoCloseSaveFileSuccessAlert);
    }

    return () => {
      /* Do nothing */
    };
  }, [saveFileSuccessAlertVisible, closeSaveFileSuccessAlert]);

  useEffect(() => {
    if (savePreviewSuccessAlertVisible) {
      const autoCloseSavePreviewSuccessAlert = setTimeout(closeSavePreviewSuccessAlert, ALERT_AUTO_CLOSE_TIMEOUT);
      return () => clearInterval(autoCloseSavePreviewSuccessAlert);
    }

    return () => {
      /* Do nothing */
    };
  }, [savePreviewSuccessAlertVisible, closeSavePreviewSuccessAlert]);

  useEffect(() => {
    electron.ipcRenderer.on(
      "requestOpenedFile",
      (event: IpcRendererEvent, data: { action: FileSaveActions; file?: File }) => {
        contentRequestData = data;
        requestSaveFile();
      }
    );

    return () => {
      electron.ipcRenderer.removeAllListeners("requestOpenedFile");
    };
  }, []);

  useEffect(() => {
    electron.ipcRenderer.on("copyContentToClipboard", () => {
      requestCopyContentToClipboard();
    });

    return () => {
      electron.ipcRenderer.removeAllListeners("copyContentToClipboard");
    };
  }, []);

  useEffect(() => {
    electron.ipcRenderer.on("savePreview", () => {
      requestSavePreview();
    });

    return () => {
      electron.ipcRenderer.removeAllListeners("savePreview");
    };
  }, []);

  useEffect(() => {
    electron.ipcRenderer.on("saveThumbnail", () => {
      requestThumbnailPreview();
    });

    return () => {
      electron.ipcRenderer.removeAllListeners("saveThumbnail");
    };
  }, [requestThumbnailPreview]);

  useEffect(() => {
    electron.ipcRenderer.on("saveFileSuccess", () => {
      setSaveFileSuccessAlertVisible(true);
      requestThumbnailPreview();
    });

    return () => {
      electron.ipcRenderer.removeAllListeners("saveFileSuccess");
    };
  }, [requestThumbnailPreview]);

  useEffect(() => {
    electron.ipcRenderer.on("savePreviewSuccess", () => {
      setSavePreviewSuccessAlertVisible(true);
    });

    return () => {
      electron.ipcRenderer.removeAllListeners("savePreviewSuccess");
    };
  }, []);

  const file = useMemo(
    () => ({
      fileName: context.file?.filePath ?? "",
      editorType: context.file?.fileType as EditorType,
      getFileContents: () => Promise.resolve(context.file?.fileContent ?? ""),
      isReadOnly: false
    }),
    [context.file?.filePath, context.file?.fileType, context.file?.fileContent]
  );

  return (
    <Page className={"kogito--editor-page"}>
      <PageSection variant="dark" noPadding={true} style={{ flexBasis: "100%" }}>
        <Stack>
          <StackItem>
            <EditorToolbar onClose={props.onClose} onSave={saveFile} />
          </StackItem>

          <StackItem className="pf-m-fill">
            {copySuccessAlertVisible && (
              <div className={"kogito--alert-container"}>
                <Alert
                  variant="success"
                  title="Content copied to clipboard"
                  action={<AlertActionCloseButton onClose={closeCopySuccessAlert} />}
                />
              </div>
            )}
            {saveFileSuccessAlertVisible && (
              <div className={"kogito--alert-container"}>
                <Alert
                  variant="success"
                  title={"File saved successfully!"}
                  action={<AlertActionCloseButton onClose={closeSaveFileSuccessAlert} />}
                />
              </div>
            )}
            {savePreviewSuccessAlertVisible && (
              <div className={"kogito--alert-container"}>
                <Alert
                  variant="success"
                  title={"Preview saved successfully!"}
                  action={<AlertActionCloseButton onClose={closeSavePreviewSuccessAlert} />}
                />
              </div>
            )}
            <EmbeddedEditor
              ref={editorRef}
              file={file}
              router={context.router}
              channelType={ChannelType.DESKTOP}
              onContentResponse={onContentResponse}
              onPreviewResponse={onPreviewResponse}
              onReady={requestThumbnailPreview}
            />
          </StackItem>
        </Stack>
        <textarea ref={copyContentTextArea} style={{ opacity: 0, width: 0, height: 0 }} />
      </PageSection>
    </Page>
  );
}
