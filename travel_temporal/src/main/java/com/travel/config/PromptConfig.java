package com.travel.config;

import lombok.Getter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.PropertySource;

@Configuration
@PropertySource("classpath:prompts.properties")
@Getter
public class PromptConfig {

    @Value("${ai.assistant.parse-prompt}")
    private String parsePrompt;

    @Value("${ai.advisor.weather-prompt}")
    private String weatherPrompt;

    @Value("${ai.advisor.visa-prompt}")
    private String visaPrompt;

    @Value("${ai.advisor.coordinator-prompt}")
    private String coordinatorPrompt;
}
