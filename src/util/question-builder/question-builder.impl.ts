import {ChoiceOptions, ListQuestion, Question} from 'inquirer';
import {QuestionBuilder, QuestionTypes} from './question-builder.api';
import {isUndefined, isUndefinedOrNull} from '../object-util';

import * as inquirer from 'inquirer';

function isChoiceOption<T>(choice: ChoiceOptions<T>): choice is ChoiceOptions<T> {
  return choice && !!(choice as ChoiceOptions<T>).value;
}

inquirer.registerPrompt('suggest', require('inquirer-prompt-suggest'));
inquirer.registerPrompt('checkbox-plus', require('inquirer-checkbox-plus-prompt'));

export class QuestionBuilderImpl<T = any> implements QuestionBuilder<T> {
  readonly _questions: Array<Question<T>> = [];
  readonly answers: T = {} as any;

  question(question: QuestionTypes<T>, value?: string, alwaysPrompt?: boolean): QuestionBuilder<T> {
    console.log('Adding question: ');

    if (this.singleChoice(question) && !alwaysPrompt) {
      console.log('  Single choice');

      const choiceValue = this.getChoiceValues(question)[0];

      // @ts-ignore
      this.answers[question.name as string] = choiceValue;
    } else if (!this.valueProvided(question, value)) {
      console.log('  Value not provided');

      this._questions.push(question);
    } else {
      console.log('  Value provided: ', {name: question.name, value});

      // @ts-ignore
      this.answers[question.name as string] = value;
    }

    return this;
  }

  questions(questions: Array<QuestionTypes<T>>): QuestionBuilder<T> {
    questions.forEach(q => this._questions.push(q));

    return this;
  }

  hasQuestions(): boolean {
    return this._questions.length > 0;
  }

  valueProvided(
    question: Question<T> | ListQuestion<T>,
    value?: string,
  ): boolean {

    const choiceValues: string[] = this.getChoiceValues(question);

    if (choiceValues.length > 0 && !isUndefined(value)) {
      return choiceValues.includes(value);
    } else {
      return !isUndefinedOrNull(value);
    }
  }

  singleChoice(
    question: Question<T> | ListQuestion<T>,
  ): boolean {

    const choiceValues: string[] = this.getChoiceValues(question);

    return choiceValues.length === 1;
  }

  getChoiceValues(question: Question<T> | ListQuestion<T>): string[] {
    const choices = (((question as ListQuestion<T>).choices) as Array<ChoiceOptions<T>>) || [];

    return choices
      .map(v => this.mapChoiceTypeToValue(v) as string)
      .filter(value => !isUndefined(value));
  }

  mapChoiceTypeToValue(choice: ChoiceOptions<T> | string): string | undefined {
    if (typeof choice === 'string') {
      return choice;
    } else if (isChoiceOption(choice)) {
      return choice.value;
    } else {
      return;
    }
  }

  async prompt(): Promise<T> {
    console.log('prompting for values: ' + this._questions.length);

    const promptValues = this._questions.length > 0 ? await inquirer.prompt(this._questions) : {};

    return Object.assign({}, this.answers, promptValues);
  }
}
