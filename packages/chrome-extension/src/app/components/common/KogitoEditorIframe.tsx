/*
 * Copyright 2019 Red Hat, Inc. and/or its affiliates.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *        http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { ChannelType, EditorContent, ResourceContentRequest, ResourceListRequest } from "@kogito-tooling/core-api";
import { EditorType, EmbeddedEditor, EmbeddedEditorRef } from "@kogito-tooling/embedded-editor";
import * as React from "react";
import { useCallback, useContext, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { runScriptOnPage } from "../../utils";
import { useGitHubApi } from "../common/GitHubContext";
import { useGlobals } from "./GlobalContext";
import { IsolatedEditorContext } from "./IsolatedEditorContext";
import { IsolatedEditorRef } from "./IsolatedEditorRef";

const GITHUB_CODEMIRROR_EDITOR_SELECTOR = `.file-editor-textarea + .CodeMirror`;
const GITHUB_EDITOR_SYNC_POLLING_INTERVAL = 1500;

interface Props {
  openFileExtension: string;
  contentPath: string;
  getFileContents: () => Promise<string | undefined>;
  readonly: boolean;
}

const RefForwardingKogitoEditorIframe: React.RefForwardingComponent<IsolatedEditorRef, Props> = (props, forwardedRef) => {
  const githubApi = useGitHubApi();
  const editorRef = useRef<EmbeddedEditorRef>(null);
  const { router, editorIndexPath, resourceContentServiceFactory } = useGlobals();
  const { repoInfo, textMode, fullscreen, onEditorReady } = useContext(IsolatedEditorContext);

  //Lookup ResourceContentService
  const resourceContentService = useMemo(() => {
    return resourceContentServiceFactory.createNew(githubApi.octokit(), repoInfo);
  }, [repoInfo]);

  //Wrap file content into object for EmbeddedEditor
  const file = useMemo(() => {
    return {
      fileName: props.contentPath,
      editorType: props.openFileExtension as EditorType,
      getFileContents: props.getFileContents,
      isReadOnly: props.readonly
    }
  }, [props.contentPath, props.openFileExtension, props.getFileContents, props.readonly]);

  useEffect(() => {
    if (textMode) {
      editorRef.current?.requestContent();
      return;
    }

    if (props.readonly) {
      return;
    }

    let task: number;
    Promise.resolve()
      .then(() => props.getFileContents())
      .then(c => editorRef.current?.setContent(c ?? ""))
      .then(() => {
        task = window.setInterval(
          () => editorRef.current?.requestContent(),
          GITHUB_EDITOR_SYNC_POLLING_INTERVAL
        );
      });

    return () => clearInterval(task);
  }, [textMode]);

  //When requests for the EmbeddedEditor content completes update CodeMirror's value
  const onContentResponse = useCallback((editorContent: EditorContent) => {
    if (props.readonly) {
      return;
    }

    //keep line breaks
    const content = editorContent.content.split("\n").join("\\n");

    runScriptOnPage(
      `document.querySelector("${GITHUB_CODEMIRROR_EDITOR_SELECTOR}").CodeMirror.setValue('${content}')`
    );
  }, [props.readonly]);

  //Forward reference methods to set content programmatically vs property
  useImperativeHandle(
    forwardedRef,
    () => {
      if (!editorRef.current) {
        return null;
      }

      return {
        setContent: (content: string) => {
          editorRef.current?.setContent(content);
          return Promise.resolve();
        }
      };
    },
    []
  );

  return (
    <>
      <div className={`kogito-iframe ${fullscreen ? "fullscreen" : "not-fullscreen"}`}>
        <EmbeddedEditor
          ref={editorRef}
          file={file}
          router={router}
          channelType={ChannelType.GITHUB}
          onReady={onEditorReady}
          onContentResponse={onContentResponse}
          onResourceContentRequest={(request: ResourceContentRequest) => resourceContentService.get(request.path, request.opts)}
          onResourceListRequest={(request: ResourceListRequest) => resourceContentService.list(request.pattern, request.opts)}
          envelopeUri={router.getRelativePathTo(editorIndexPath)}
        />
      </div>
    </>
  );
};

export const KogitoEditorIframe = React.forwardRef(RefForwardingKogitoEditorIframe);
