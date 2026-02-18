"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button-shadcn";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useAIStats, useAIActions } from "utils/hooks/useAI";
import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import debounce from "lodash.debounce";
import {
  KeepLoader,
  PageSubtitle,
  showErrorToast,
  showSuccessToast,
} from "@/shared/ui";
import { PageTitle } from "@/shared/ui";
import { AIConfig } from "./model";

// Helper to check if a setting is a numeric type
const isNumericSetting = (type: string) => type === "float" || type === "int";

function RangeInputWithLabel({
  setting,
  onChange,
}: {
  setting: any;
  onChange: (newValue: number) => void;
}) {
  const [value, setValue] = useState(setting.value);

  // Create a memoized debounced function
  const debouncedOnChange = useMemo(
    () => debounce((value: number) => onChange(value), 1000),
    [onChange]
  );

  // Cleanup the debounced function on unmount
  useEffect(() => {
    return () => {
      debouncedOnChange.cancel();
    };
  }, [debouncedOnChange]);

  return (
    <div className="flex flex-col gap-1 items-end w-full">
      <p className="text-right text-sm text-gray-500">value: {value}</p>
      <Slider
        value={[value]}
        onValueChange={(newValues) => {
          const newValue = newValues[0];
          setValue(newValue);
          debouncedOnChange(newValue);
        }}
        min={setting.min}
        max={setting.max}
        step={(setting.max - setting.min) / 100}
        className="w-full"
      />
    </div>
  );
}

export function AIPlugins() {
  const {
    data: aistats,
    isLoading,
    mutate: refetchAIStats,
  } = useAIStats({
    refreshInterval: 5000,
  });
  const { updateAISettings } = useAIActions();

  const handleUpdateAISettings = async (
    algorithm_id: string,
    algorithm_config: AIConfig
  ) => {
    try {
      await updateAISettings(algorithm_id, algorithm_config);
      showSuccessToast("Settings updated successfully!");
      refetchAIStats();
    } catch (error) {
      showErrorToast(error);
    }
  };

  return (
    <main className="flex flex-col gap-6">
      <header className="flex justify-between items-center">
        <div>
          <PageTitle>AI Plugins</PageTitle>
          <PageSubtitle>
            For correlation, summarization, and enrichment
          </PageSubtitle>
        </div>
      </header>
      <Card className="p-0 overflow-hidden">
        <div>
          <div>
            <div className="grid grid-cols-1 gap-4">
              {isLoading ? (
                <KeepLoader loadingText="Loading algorithms and their settings..." />
              ) : null}
              {aistats?.algorithm_configs?.length === 0 && (
                <div className="flex flex-row p-6">
                  <Image
                    src="/keep_sleeping.png"
                    alt="AI"
                    width={300}
                    height={300}
                    className="mr-4 rounded-lg"
                  />
                  <div>
                    <h2 className="text-xl font-semibold mb-2">No AI enabled for this tenant</h2>
                    <p className="pt-2">
                      AI plugins can correlate, enrich, or summarize your alerts
                      and incidents by leveraging the the context within Keep
                      allowing you to gain deeper insights and respond more
                      effectively.
                    </p>
                    <p className="pt-2">
                      By the way, AI plugins are designed to work even in
                      air-gapped environments. You can train models using your
                      data, so there is no need to share information with
                      third-party providers like OpenAI. Keep your data secure
                      and private.
                    </p>
                    <p className="pt-2">
                      <a
                        href="https://www.keephq.dev/meet-keep"
                        className="text-orange-500 underline"
                      >
                        Talk to us to get access!
                      </a>
                    </p>
                  </div>
                </div>
              )}
              {aistats?.algorithm_configs?.map((algorithm_config, index) => (
                <Card
                  key={index}
                  className="p-4 flex flex-col justify-between w-full border-white border-2"
                >
                  <h3 className="text-md font-semibold line-clamp-2">
                    {algorithm_config.algorithm.name}
                  </h3>
                  <p className="text-sm">
                    {algorithm_config.algorithm.description}
                  </p>
                  <div className="flex flex-row">
                    <div className="my-4 p-2 border-y border-gray-200 flex flex-col gap-4">
                      {algorithm_config.settings.map((setting) => (
                        <div
                          key={setting.name}
                          className="flex flex-col gap-2"
                        >
                          <div className="flex flex-row items-start gap-2">
                            {setting.type === "bool" ? (
                              <Switch
                                id={`switch-${index}-${setting.name}`}
                                checked={setting.value}
                                onCheckedChange={(checked) => {
                                  setting.value = checked;
                                  handleUpdateAISettings(
                                    algorithm_config.algorithm_id,
                                    algorithm_config
                                  );
                                }}
                              />
                            ) : null}
                            <div className="flex-1">
                              <Label htmlFor={`switch-${index}-${setting.name}`} className="text-sm font-medium">
                                {setting.name}
                              </Label>
                              <p className="text-sm text-gray-500">
                                {setting.description}
                              </p>
                            </div>
                          </div>
                          {isNumericSetting(setting.type) && (
                            <div className="w-full mt-2">
                              <RangeInputWithLabel
                                key={String(setting.value)}
                                setting={setting}
                                onChange={(newValue) => {
                                  setting.value = newValue;
                                  handleUpdateAISettings(
                                    algorithm_config.algorithm_id,
                                    algorithm_config
                                  );
                                }}
                              />
                            </div>
                          )}
                          {setting !== algorithm_config.settings[algorithm_config.settings.length - 1] && (
                            <Separator className="my-2" />
                          )}
                        </div>
                      ))}
                    </div>

                    {algorithm_config.settings_proposed_by_algorithm &&
                      JSON.stringify(algorithm_config.settings) !==
                        JSON.stringify(
                          algorithm_config.settings_proposed_by_algorithm
                        ) && (
                        <Card className="m-2 mt-4 p-4 border-orange-200">
                          <h4 className="text-lg font-semibold mb-2">New Settings Proposal</h4>
                          <p className="text-sm text-gray-600 mb-3">
                            The last time the model was trained and used for
                            inference, it suggested a configuration update.
                            However, please note that a configuration update
                            might not be very effective if the data quantity or
                            quality is low. For more details, please refer to
                            the logs below.
                          </p>
                          <div className="flex flex-wrap gap-2 mb-4">
                            {algorithm_config.settings_proposed_by_algorithm.map(
                              (proposed_setting: any, idx: number) => (
                                <Badge key={idx} variant="orange">
                                  {proposed_setting.name}: {String(proposed_setting.value)}
                                </Badge>
                              )
                            )}
                          </div>
                          <Button
                            variant="primary"
                            onClick={() => {
                              algorithm_config.settings =
                                algorithm_config.settings_proposed_by_algorithm;
                              handleUpdateAISettings(
                                algorithm_config.algorithm_id,
                                algorithm_config
                              );
                            }}
                          >
                            Apply proposed settings
                          </Button>
                        </Card>
                      )}
                  </div>
                  <Separator className="my-4" />
                  <div>
                    <h4 className="text-md font-medium mb-2">Execution logs:</h4>
                    <ScrollArea className="h-[200px] w-full rounded border bg-gray-50">
                      <pre className="text-sm p-4 break-words whitespace-pre-wrap">
                        {algorithm_config.feedback_logs
                          ? algorithm_config.feedback_logs
                          : "Algorithm not executed yet."}
                      </pre>
                    </ScrollArea>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </Card>
    </main>
  );
}
